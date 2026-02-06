import type {
  AGENT_LEVELS,
  AGENT_STATUSES,
  TASK_STATUSES,
  KANBAN_COLUMNS,
  BOARD_ITEM_TYPES,
} from "./constants.ts";

// ── Enum types derived from constants ────────────────────────────────

export type AgentLevel = (typeof AGENT_LEVELS)[number];
export type AgentStatus = (typeof AGENT_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type KanbanColumn = (typeof KANBAN_COLUMNS)[number];
export type BoardItemType = (typeof BOARD_ITEM_TYPES)[number];

// ── Agent configuration ──────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  displayName: string;
  role: string;
  department: string;
  level: AgentLevel;
  personality: string;
  status: AgentStatus;
  currentTaskId: string | null;
  avatarColor: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Task state ───────────────────────────────────────────────────────

export interface TaskTag {
  label: string;
  color: string;
  bg: string;
}

export interface TaskState {
  id: string;
  parentTaskId: string | null;
  assigneeId: string;
  delegatorId: string | null;
  prompt: string;
  context: string | null;
  priority: number;
  status: TaskStatus;
  tags: TaskTag[];
  result: string | null;
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

// ── Org chart ────────────────────────────────────────────────────────

export interface OrgNode {
  agentName: string;
  parentAgentName: string | null;
  children: OrgNode[];
  position: number;
}

export interface OrgTree {
  roots: OrgNode[];
}

// ── Messages ─────────────────────────────────────────────────────────

export interface Message {
  id: string;
  fromAgentId: string | null;
  toAgentId: string;
  threadId: string;
  subject: string | null;
  body: string;
  type: "direct" | "system" | "chat";
  status: "pending" | "delivered" | "read";
  createdAt: string;
  readAt: string | null;
}

// ── Board items ──────────────────────────────────────────────────────

export interface BoardItem {
  id: string;
  type: BoardItemType;
  author: string;
  summary: string;
  body: string;
  createdAt: string;
  path: string;
}

// ── Orchestration events ─────────────────────────────────────────────

export type OrchestrationEventMap = {
  agent_created: { agentName: string };
  agent_status_changed: { agentName: string; status: AgentStatus };
  agent_updated: { agentName: string };
  agent_deleted: { agentName: string };
  task_created: { taskId: string; assignee: string; delegator: string | null };
  task_status_changed: { taskId: string; status: TaskStatus };
  task_updated: { taskId: string };
  message_created: { messageId: string; from: string | null; to: string; threadId: string };
  board_item_created: { itemType: string; author: string; path: string };
  org_changed: Record<string, never>;
  agent_stream_event: { agentName: string; taskId: string; event: AgentStreamEvent };
};

// ── Agent stream events (from SDK) ──────────────────────────────────

export type AgentStreamEvent =
  | { type: "thinking"; content: string }
  | { type: "tool_use"; tool: string; input: unknown }
  | { type: "tool_result"; tool: string; output: string }
  | { type: "message"; content: string }
  | { type: "result"; result: AgentResult };

export interface AgentResult {
  output: string;
  costUsd: number;
  durationMs: number;
  numTurns: number;
  status: "success" | "error" | "max_turns";
}

// ── MCP tool dependencies ────────────────────────────────────────────

export interface McpToolDeps {
  basePath: string;
  agentName: string;
  taskId: string;
  emit: <K extends keyof OrchestrationEventMap>(
    event: K,
    payload: OrchestrationEventMap[K],
  ) => void;
}

// ── Prompt builder params ────────────────────────────────────────────

export interface PendingResult {
  childTaskId: string;
  result: string;
}

export interface OrgReport {
  name: string;
  role: string;
  status: string;
  currentTask: string | null;
}

export interface ManagerInfo {
  name: string;
  role: string;
  status: string;
}

export interface BuildSystemPromptParams {
  agent: AgentConfig;
  task: TaskState;
  delegatorDisplayName?: string;
  pendingResults?: PendingResult[];
  orgReports?: OrgReport[];
  manager?: ManagerInfo | null;
  recentBoardItems?: Array<{ type: string; author: string; summary: string; timestamp: string }>;
  contextMd?: string;
}
