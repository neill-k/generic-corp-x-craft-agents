import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import { EventBus } from "./events.ts";
import { AgentStorage } from "./storage/agents.ts";
import { TaskStorage } from "./storage/tasks.ts";
import { MessageStorage } from "./storage/messages.ts";
import { BoardStorage } from "./storage/board.ts";
import { OrgStorage } from "./storage/org.ts";
import { buildAgentSystemPrompt } from "./prompt-builder.ts";
import { handleChildCompletion } from "./delegation-flow.ts";
import { createOrchestrationMcpServer } from "./mcp/server.ts";
import type {
  AgentConfig,
  AgentStatus,
  TaskState,
  OrgTree,
  OrchestrationEventMap,
  McpToolDeps,
  BoardItem,
  Message,
} from "./types.ts";

interface RunningAgent {
  name: string;
  taskId: string;
  abortController: AbortController;
  startedAt: Date;
}

interface SpawnOptions {
  agentConfig: AgentConfig;
  task: TaskState;
  additionalMcpServers?: Record<string, unknown>;
}

const DEFAULT_CONCURRENCY_LIMIT = 3;

export class OrchestrationEngine {
  readonly basePath: string;
  readonly agents: AgentStorage;
  readonly tasks: TaskStorage;
  readonly messages: MessageStorage;
  readonly board: BoardStorage;
  readonly org: OrgStorage;

  private readonly eventBus = new EventBus<OrchestrationEventMap>();
  private readonly runningAgents = new Map<string, RunningAgent>();
  private concurrencyLimit = DEFAULT_CONCURRENCY_LIMIT;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.agents = new AgentStorage(basePath);
    this.tasks = new TaskStorage(basePath);
    this.messages = new MessageStorage(basePath);
    this.board = new BoardStorage(basePath);
    this.org = new OrgStorage(basePath);
  }

  async initialize(): Promise<void> {
    await mkdir(join(this.basePath, "agents"), { recursive: true });
    await mkdir(join(this.basePath, "tasks"), { recursive: true });
    await mkdir(join(this.basePath, "messages"), { recursive: true });
    await mkdir(join(this.basePath, "board"), { recursive: true });
  }

  // ── Event subscription ──────────────────────────────────────────────

  on<K extends keyof OrchestrationEventMap>(
    event: K,
    handler: (payload: OrchestrationEventMap[K]) => void,
  ): () => void {
    return this.eventBus.on(event, handler);
  }

  emit<K extends keyof OrchestrationEventMap>(
    event: K,
    payload: OrchestrationEventMap[K],
  ): void {
    this.eventBus.emit(event, payload);
  }

  // ── Agent lifecycle ─────────────────────────────────────────────────

  async spawnAgent(options: SpawnOptions): Promise<string> {
    const { agentConfig, task } = options;

    if (this.runningAgents.size >= this.concurrencyLimit) {
      throw new Error(
        `[Engine] Concurrency limit reached (${this.concurrencyLimit}). ` +
        `Cannot spawn agent ${agentConfig.name}.`,
      );
    }

    // Update agent status to running
    agentConfig.status = "running";
    agentConfig.currentTaskId = task.id;
    agentConfig.updatedAt = new Date().toISOString();
    await this.agents.save(agentConfig);
    this.emit("agent_status_changed", { agentName: agentConfig.name, status: "running" });

    // Update task status to running
    task.status = "running";
    task.startedAt = new Date().toISOString();
    await this.tasks.save(task);
    this.emit("task_status_changed", { taskId: task.id, status: "running" });

    // Build system prompt
    const orgReports = await this.getOrgReports(agentConfig.name);
    const manager = await this.getManager(agentConfig.name);
    const pendingResults = await this.getPendingResults(agentConfig.name);
    const contextMd = await this.getAgentContext(agentConfig.name);
    const recentBoardItems = await this.getRecentBoardItems();

    const systemPrompt = buildAgentSystemPrompt({
      agent: agentConfig,
      task,
      orgReports,
      manager,
      pendingResults,
      contextMd,
      recentBoardItems,
    });

    // Create MCP server for this agent
    const mcpDeps: McpToolDeps = {
      basePath: this.basePath,
      agentName: agentConfig.name,
      taskId: task.id,
      emit: (event, payload) => this.emit(event, payload),
    };
    const mcpServer = createOrchestrationMcpServer(mcpDeps);

    // Track the running agent
    const abortController = new AbortController();
    this.runningAgents.set(agentConfig.name, {
      name: agentConfig.name,
      taskId: task.id,
      abortController,
      startedAt: new Date(),
    });

    // Return the task ID — actual agent invocation is done by the caller
    // using the SDK's query() with the systemPrompt and mcpServer
    return task.id;
  }

  async completeAgent(
    agentName: string,
    taskId: string,
    status: "completed" | "failed" | "blocked",
    result: string | null,
    costUsd?: number,
    durationMs?: number,
    numTurns?: number,
  ): Promise<void> {
    // Update task
    const task = await this.tasks.get(taskId);
    if (task) {
      task.status = status;
      task.result = result;
      task.completedAt = new Date().toISOString();
      if (costUsd !== undefined) task.costUsd = costUsd;
      if (durationMs !== undefined) task.durationMs = durationMs;
      if (numTurns !== undefined) task.numTurns = numTurns;
      await this.tasks.save(task);
      this.emit("task_status_changed", { taskId, status });

      // Handle delegation result delivery
      if (task.parentTaskId && task.delegatorId) {
        const parentTask = await this.tasks.get(task.parentTaskId);
        if (parentTask) {
          await handleChildCompletion(
            this.basePath,
            taskId,
            result,
            status,
            task.parentTaskId,
            parentTask.assigneeId,
          );
        }
      }
    }

    // Update agent status
    const agent = await this.agents.get(agentName);
    if (agent) {
      agent.status = "idle";
      agent.currentTaskId = null;
      agent.updatedAt = new Date().toISOString();
      await this.agents.save(agent);
      this.emit("agent_status_changed", { agentName, status: "idle" });
    }

    // Remove from running agents
    this.runningAgents.delete(agentName);
  }

  isAgentRunning(agentName: string): boolean {
    return this.runningAgents.has(agentName);
  }

  getRunningAgentCount(): number {
    return this.runningAgents.size;
  }

  setConcurrencyLimit(limit: number): void {
    this.concurrencyLimit = limit;
  }

  // ── Convenience query methods ───────────────────────────────────────

  async getAgent(name: string): Promise<AgentConfig | null> {
    return this.agents.get(name);
  }

  async listAgents(): Promise<AgentConfig[]> {
    return this.agents.list();
  }

  async getTask(id: string): Promise<TaskState | null> {
    return this.tasks.get(id);
  }

  async listTasks(filter?: { assigneeId?: string; status?: string }): Promise<TaskState[]> {
    return this.tasks.list(filter);
  }

  async getOrgTree(): Promise<OrgTree> {
    return this.org.get();
  }

  async listBoardItems(filter?: { type?: string; author?: string; limit?: number }): Promise<BoardItem[]> {
    return this.board.list(filter);
  }

  async getUnreadMessages(agentName: string): Promise<Message[]> {
    return this.messages.getUnread(agentName);
  }

  // ── Task creation (for delegation) ──────────────────────────────────

  async createTask(
    assigneeName: string,
    prompt: string,
    context: string | null,
    delegatorName: string | null,
    parentTaskId: string | null,
    priority: number = 0,
  ): Promise<TaskState> {
    const task: TaskState = {
      id: randomUUID(),
      parentTaskId,
      assigneeId: assigneeName,
      delegatorId: delegatorName,
      prompt,
      context,
      priority,
      status: "pending",
      tags: [],
      result: null,
      costUsd: null,
      durationMs: null,
      numTurns: null,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null,
    };
    await this.tasks.save(task);
    this.emit("task_created", {
      taskId: task.id,
      assignee: assigneeName,
      delegator: delegatorName,
    });
    return task;
  }

  // ── Private helpers ─────────────────────────────────────────────────

  private async getOrgReports(agentName: string) {
    const children = await this.org.getChildren(agentName);
    const reports = [];
    for (const child of children) {
      const agent = await this.agents.get(child.agentName);
      if (agent) {
        reports.push({
          name: agent.name,
          role: agent.role,
          status: agent.status,
          currentTask: agent.currentTaskId,
        });
      }
    }
    return reports;
  }

  private async getManager(agentName: string) {
    const parentName = await this.org.getParent(agentName);
    if (!parentName) return null;
    const parent = await this.agents.get(parentName);
    if (!parent) return null;
    return {
      name: parent.displayName,
      role: parent.role,
      status: parent.status,
    };
  }

  private async getPendingResults(agentName: string) {
    const resultsDir = join(this.basePath, "agents", agentName, "results");
    try {
      const { readdir } = await import("node:fs/promises");
      const entries = await readdir(resultsDir);
      const results = [];
      for (const entry of entries) {
        if (!entry.endsWith(".md")) continue;
        const content = await readFile(join(resultsDir, entry), "utf-8");
        const taskIdMatch = entry.match(/-([a-f0-9-]+)\.md$/);
        results.push({
          childTaskId: taskIdMatch?.[1] ?? entry,
          result: content,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private async getAgentContext(agentName: string): Promise<string | undefined> {
    try {
      const contextPath = join(this.basePath, "agents", agentName, "context.md");
      return await readFile(contextPath, "utf-8");
    } catch {
      return undefined;
    }
  }

  private async getRecentBoardItems() {
    const items = await this.board.list({ limit: 5 });
    return items.map(item => ({
      type: item.type,
      author: item.author,
      summary: item.summary,
      timestamp: item.createdAt,
    }));
  }
}
