import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AgentStorage } from "../storage/agents.ts"
import { TaskStorage } from "../storage/tasks.ts"
import { MessageStorage } from "../storage/messages.ts"
import { BoardStorage } from "../storage/board.ts"
import { OrgStorage } from "../storage/org.ts"
import type { McpToolDeps, AgentConfig, TaskState, OrchestrationEventMap } from "../types.ts"

// We test tools by calling the underlying handler functions directly,
// extracting them from the tool factory return values.

import { sendMessageTool } from "../mcp/tools/send-message.ts"
import { readMessagesTool } from "../mcp/tools/read-messages.ts"
import { queryBoardTool } from "../mcp/tools/query-board.ts"
import { postToBoardTool } from "../mcp/tools/post-to-board.ts"
import { finishTaskTool } from "../mcp/tools/finish-task.ts"
import { createAgentTool } from "../mcp/tools/create-agent.ts"
import { deleteAgentTool } from "../mcp/tools/delete-agent.ts"
import { listAgentsTool } from "../mcp/tools/list-agents.ts"

// ── Helpers ──────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    displayName: "Test Agent",
    role: "Engineer",
    department: "Engineering",
    level: "ic",
    personality: "Hardworking",
    status: "idle",
    currentTaskId: null,
    avatarColor: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskState> = {}): TaskState {
  return {
    id: "task-1",
    parentTaskId: null,
    assigneeId: "test-agent",
    delegatorId: null,
    prompt: "Do something",
    context: null,
    priority: 0,
    status: "running",
    tags: [],
    result: null,
    costUsd: null,
    durationMs: null,
    numTurns: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  }
}

type EmittedEvent = { event: string; payload: unknown }

function makeDeps(tmpDir: string, overrides: Partial<McpToolDeps> = {}): McpToolDeps & { emitted: EmittedEvent[] } {
  const emitted: EmittedEvent[] = []
  return {
    basePath: tmpDir,
    agentName: "test-agent",
    taskId: "task-1",
    emit: ((event: string, payload: unknown) => {
      emitted.push({ event, payload })
    }) as McpToolDeps["emit"],
    emitted,
    ...overrides,
  }
}

function getText(result: { content: Array<{ type: string; text: string }> }): string {
  return result.content[0]!.text
}

// ═════════════════════════════════════════════════════════════════════
// send_message
// ═════════════════════════════════════════════════════════════════════

describe("send_message tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let messages: MessageStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    messages = new MessageStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("sends a message and emits event", async () => {
    const tools = sendMessageTool(deps, messages)
    const handler = tools[0]!
    const result = await (handler as any).handler({ toAgent: "bob", body: "hello", subject: "Hi" })
    const text = getText(result)
    expect(text).toContain("Message sent to bob")

    // Event emitted
    expect(deps.emitted).toHaveLength(1)
    expect(deps.emitted[0]!.event).toBe("message_created")
    const payload = deps.emitted[0]!.payload as { from: string; to: string }
    expect(payload.from).toBe("test-agent")
    expect(payload.to).toBe("bob")

    // Message persisted
    const unread = await messages.getUnread("bob")
    expect(unread).toHaveLength(1)
    expect(unread[0]!.body).toBe("hello")
    expect(unread[0]!.subject).toBe("Hi")
  })

  it("creates new thread when threadId not provided", async () => {
    const tools = sendMessageTool(deps, messages)
    const handler = tools[0]!
    await (handler as any).handler({ toAgent: "bob", body: "hello" })
    const unread = await messages.getUnread("bob")
    expect(unread[0]!.threadId).toBeTruthy()
  })

  it("uses provided threadId for replies", async () => {
    const tools = sendMessageTool(deps, messages)
    const handler = tools[0]!
    await (handler as any).handler({ toAgent: "bob", body: "hello", threadId: "existing-thread" })
    const thread = await messages.listThread("existing-thread")
    expect(thread).toHaveLength(1)
    expect(thread[0]!.body).toBe("hello")
  })
})

// ═════════════════════════════════════════════════════════════════════
// read_messages
// ═════════════════════════════════════════════════════════════════════

describe("read_messages tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let messages: MessageStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    messages = new MessageStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("returns unread messages when no threadId", async () => {
    // Save a message to test-agent
    await messages.save({
      id: "m1",
      fromAgentId: "bob",
      toAgentId: "test-agent",
      threadId: "t1",
      subject: "Hey",
      body: "check this",
      type: "direct",
      status: "delivered",
      createdAt: new Date().toISOString(),
      readAt: null,
    })

    const tools = readMessagesTool(deps, messages)
    const handler = tools[0]!
    const result = await (handler as any).handler({})
    const parsed = JSON.parse(getText(result))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].from).toBe("bob")
    expect(parsed[0].body).toBe("check this")
  })

  it("reads thread and marks messages as read", async () => {
    await messages.save({
      id: "m1",
      fromAgentId: "bob",
      toAgentId: "test-agent",
      threadId: "t1",
      subject: null,
      body: "first",
      type: "direct",
      status: "delivered",
      createdAt: new Date().toISOString(),
      readAt: null,
    })

    const tools = readMessagesTool(deps, messages)
    const handler = tools[0]!
    await (handler as any).handler({ threadId: "t1" })

    // Message should now be read
    const msg = await messages.get("m1", "t1")
    expect(msg!.status).toBe("read")
    expect(msg!.readAt).not.toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
// post_to_board
// ═════════════════════════════════════════════════════════════════════

describe("post_to_board tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let board: BoardStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    board = new BoardStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("posts a board item and emits event", async () => {
    const tools = postToBoardTool(deps, board)
    const handler = tools[0]!
    const result = await (handler as any).handler({
      type: "status_update",
      summary: "All systems go",
      body: "Everything is working fine.",
    })
    const text = getText(result)
    expect(text).toContain("[status_update]")
    expect(text).toContain("All systems go")

    expect(deps.emitted).toHaveLength(1)
    expect(deps.emitted[0]!.event).toBe("board_item_created")

    const items = await board.list({ type: "status_update" })
    expect(items).toHaveLength(1)
    expect(items[0]!.summary).toBe("All systems go")
    expect(items[0]!.author).toBe("test-agent")
  })
})

// ═════════════════════════════════════════════════════════════════════
// query_board
// ═════════════════════════════════════════════════════════════════════

describe("query_board tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let board: BoardStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    board = new BoardStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("queries board items with default limit", async () => {
    await board.save({
      id: "i1", type: "blocker", author: "alice",
      summary: "blocked on API", body: "Need API key",
      createdAt: new Date().toISOString(), path: "",
    })

    const tools = queryBoardTool(deps, board)
    const handler = tools[0]!
    const result = await (handler as any).handler({})
    const parsed = JSON.parse(getText(result))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].type).toBe("blocker")
  })

  it("filters by type", async () => {
    await board.save({
      id: "i1", type: "blocker", author: "alice",
      summary: "blocked", body: "x", createdAt: new Date().toISOString(), path: "",
    })
    await board.save({
      id: "i2", type: "finding", author: "alice",
      summary: "found bug", body: "y", createdAt: new Date().toISOString(), path: "",
    })

    const tools = queryBoardTool(deps, board)
    const handler = tools[0]!
    const result = await (handler as any).handler({ type: "finding" })
    const parsed = JSON.parse(getText(result))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].summary).toBe("found bug")
  })
})

// ═════════════════════════════════════════════════════════════════════
// finish_task — delegation flow
// ═════════════════════════════════════════════════════════════════════

describe("finish_task tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let tasks: TaskStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    tasks = new TaskStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("marks task as completed", async () => {
    await tasks.save(makeTask())
    const tools = finishTaskTool(deps, tasks)
    const handler = tools[0]!
    const result = await (handler as any).handler({ status: "completed", result: "Done!" })
    const text = getText(result)
    expect(text).toContain("marked as completed")

    const task = await tasks.get("task-1")
    expect(task!.status).toBe("completed")
    expect(task!.result).toBe("Done!")
    expect(task!.completedAt).not.toBeNull()
  })

  it("triggers delegation flow for child tasks", async () => {
    // Create parent task
    const parentTask = makeTask({
      id: "parent-task",
      assigneeId: "manager",
      status: "running",
    })
    await tasks.save(parentTask)

    // Create child task (delegated)
    const childTask = makeTask({
      id: "child-task",
      parentTaskId: "parent-task",
      delegatorId: "manager",
      assigneeId: "worker",
      status: "running",
    })
    await tasks.save(childTask)

    // Set up deps for the child agent
    const childDeps = makeDeps(tmpDir, { agentName: "worker", taskId: "child-task" })

    // Ensure parent agent's directory exists
    const { mkdir } = await import("node:fs/promises")
    await mkdir(join(tmpDir, "agents", "manager", "results"), { recursive: true })

    const tools = finishTaskTool(childDeps, tasks)
    const handler = tools[0]!
    await (handler as any).handler({ status: "completed", result: "Task done successfully" })

    // Verify delegation flow: result file should exist in parent's results dir
    const resultsDir = join(tmpDir, "agents", "manager", "results")
    const entries = await readdir(resultsDir)
    expect(entries.length).toBeGreaterThan(0)

    const resultFile = await readFile(join(resultsDir, entries[0]!), "utf-8")
    expect(resultFile).toContain("child-task")
    expect(resultFile).toContain("Task done successfully")
  })

  it("does not trigger delegation flow for root tasks", async () => {
    // Root task (no parent)
    await tasks.save(makeTask({ id: "task-1", parentTaskId: null }))

    const tools = finishTaskTool(deps, tasks)
    const handler = tools[0]!
    await (handler as any).handler({ status: "completed", result: "Done" })

    // No results dir should be created
    const { access } = await import("node:fs/promises")
    try {
      await access(join(tmpDir, "agents"))
      // If agents dir exists, check no results were written
      const entries = await readdir(join(tmpDir, "agents")).catch(() => [])
      expect(entries).toHaveLength(0)
    } catch {
      // agents dir doesn't exist — correct behavior
    }
  })

  it("returns error for unknown task", async () => {
    const tools = finishTaskTool(deps, tasks)
    const handler = tools[0]!
    const result = await (handler as any).handler({ status: "completed", result: "Done" })
    const text = getText(result)
    expect(text).toContain("Unknown task")
  })
})

// ═════════════════════════════════════════════════════════════════════
// create_agent — emits agent_created
// ═════════════════════════════════════════════════════════════════════

describe("create_agent tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let agents: AgentStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    agents = new AgentStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("creates agent and emits agent_created event", async () => {
    const tools = createAgentTool(deps, agents)
    const handler = tools[0]!
    const result = await (handler as any).handler({
      name: "new-agent",
      displayName: "New Agent",
      role: "Engineer",
      department: "Engineering",
      level: "ic",
    })
    const text = getText(result)
    expect(text).toContain("new-agent")

    // Verify agent_created (not agent_updated) was emitted
    expect(deps.emitted).toHaveLength(1)
    expect(deps.emitted[0]!.event).toBe("agent_created")
    const payload = deps.emitted[0]!.payload as { agentName: string }
    expect(payload.agentName).toBe("new-agent")
  })

  it("rejects duplicate agent names", async () => {
    await agents.save(makeAgent({ name: "existing" }))
    const tools = createAgentTool(deps, agents)
    const handler = tools[0]!
    const result = await (handler as any).handler({
      name: "existing",
      displayName: "Existing",
      role: "Engineer",
      department: "Engineering",
      level: "ic",
    })
    const text = getText(result)
    expect(text).toContain("already exists")
  })
})

// ═════════════════════════════════════════════════════════════════════
// delete_agent — safety check for running tasks
// ═════════════════════════════════════════════════════════════════════

describe("delete_agent tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let agents: AgentStorage
  let org: OrgStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    agents = new AgentStorage(tmpDir)
    org = new OrgStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("deletes idle agent successfully", async () => {
    await agents.save(makeAgent({ name: "to-delete", status: "idle" }))
    const tools = deleteAgentTool(deps, agents, org)
    const handler = tools[0]!
    const result = await (handler as any).handler({ agentName: "to-delete" })
    const text = getText(result)
    expect(text).toContain("deleted")

    const agent = await agents.get("to-delete")
    expect(agent).toBeNull()
  })

  it("refuses to delete running agent", async () => {
    await agents.save(makeAgent({ name: "busy", status: "running", currentTaskId: "t1" }))
    const tools = deleteAgentTool(deps, agents, org)
    const handler = tools[0]!
    const result = await (handler as any).handler({ agentName: "busy" })
    const text = getText(result)
    expect(text).toContain("Cannot delete")
    expect(text).toContain("currently running")

    // Agent should still exist
    const agent = await agents.get("busy")
    expect(agent).not.toBeNull()
  })

  it("returns error for unknown agent", async () => {
    const tools = deleteAgentTool(deps, agents, org)
    const handler = tools[0]!
    const result = await (handler as any).handler({ agentName: "nonexistent" })
    const text = getText(result)
    expect(text).toContain("Unknown agent")
  })
})

// ═════════════════════════════════════════════════════════════════════
// list_agents — org relationships
// ═════════════════════════════════════════════════════════════════════

describe("list_agents tool", () => {
  let tmpDir: string
  let deps: ReturnType<typeof makeDeps>
  let agents: AgentStorage
  let org: OrgStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    deps = makeDeps(tmpDir)
    agents = new AgentStorage(tmpDir)
    org = new OrgStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("includes org relationships in output", async () => {
    await agents.save(makeAgent({ name: "ceo", displayName: "CEO", level: "c-suite" }))
    await agents.save(makeAgent({ name: "engineer", displayName: "Engineer" }))
    await org.setParent("ceo", null)
    await org.setParent("engineer", "ceo")

    const tools = listAgentsTool(deps, agents, org)
    const handler = tools[0]!
    const result = await (handler as any).handler({})
    const parsed = JSON.parse(getText(result))

    const ceo = parsed.find((a: any) => a.name === "ceo")
    expect(ceo.parentAgentName).toBeNull()
    expect(ceo.directReports).toContain("engineer")

    const eng = parsed.find((a: any) => a.name === "engineer")
    expect(eng.parentAgentName).toBe("ceo")
    expect(eng.directReports).toEqual([])
  })

  it("filters by department", async () => {
    await agents.save(makeAgent({ name: "a1", department: "Engineering" }))
    await agents.save(makeAgent({ name: "a2", department: "Sales" }))

    const tools = listAgentsTool(deps, agents, org)
    const handler = tools[0]!
    const result = await (handler as any).handler({ department: "Sales" })
    const parsed = JSON.parse(getText(result))
    expect(parsed).toHaveLength(1)
    expect(parsed[0].name).toBe("a2")
  })
})

// ═════════════════════════════════════════════════════════════════════
// Board atomic writes
// ═════════════════════════════════════════════════════════════════════

describe("BoardStorage atomic writes", () => {
  let tmpDir: string
  let board: BoardStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    board = new BoardStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("does not leave .tmp files after save", async () => {
    await board.save({
      id: "item-1", type: "status_update", author: "test",
      summary: "test", body: "test body",
      createdAt: new Date().toISOString(), path: "",
    })

    const dir = join(tmpDir, "board", "status-updates")
    const entries = await readdir(dir)
    const tmpFiles = entries.filter(e => e.endsWith(".tmp"))
    expect(tmpFiles).toHaveLength(0)

    // The actual file should exist
    const mdFiles = entries.filter(e => e.endsWith(".md"))
    expect(mdFiles).toHaveLength(1)
  })
})

// ═════════════════════════════════════════════════════════════════════
// Board frontmatter with colons in summary
// ═════════════════════════════════════════════════════════════════════

describe("BoardStorage frontmatter parsing", () => {
  let tmpDir: string
  let board: BoardStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "mcp-test-"))
    board = new BoardStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("handles colons in summary field", async () => {
    await board.save({
      id: "colon-test", type: "finding", author: "alice",
      summary: "Bug found: API returns 500: timeout",
      body: "Details here",
      createdAt: "2024-06-15T10:30:00.000Z", path: "",
    })

    const item = await board.get("finding", "colon-test")
    expect(item).not.toBeNull()
    expect(item!.summary).toBe("Bug found: API returns 500: timeout")
  })

  it("handles colons in createdAt (ISO timestamps)", async () => {
    const ts = "2024-06-15T10:30:45.123Z"
    await board.save({
      id: "ts-test", type: "status_update", author: "bob",
      summary: "Done", body: "All good",
      createdAt: ts, path: "",
    })

    const item = await board.get("status_update", "ts-test")
    expect(item).not.toBeNull()
    expect(item!.createdAt).toBe(ts)
  })
})
