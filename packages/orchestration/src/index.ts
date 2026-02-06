// Public API for @craft-agent/orchestration

// Engine
export { OrchestrationEngine } from "./engine.ts";

// Types
export type {
  AgentConfig,
  AgentLevel,
  AgentStatus,
  AgentResult,
  AgentStreamEvent,
  TaskState,
  TaskStatus,
  TaskTag,
  KanbanColumn,
  OrgNode,
  OrgTree,
  Message,
  BoardItem,
  BoardItemType,
  OrchestrationEventMap,
  McpToolDeps,
  BuildSystemPromptParams,
  PendingResult,
  OrgReport,
  ManagerInfo,
} from "./types.ts";

// Constants
export {
  AGENT_LEVELS,
  AGENT_STATUSES,
  TASK_STATUSES,
  KANBAN_COLUMNS,
  BOARD_ITEM_TYPES,
  BOARD_TYPE_TO_FOLDER,
  STATUS_TO_COLUMN,
} from "./constants.ts";

// Events
export { EventBus } from "./events.ts";

// Storage
export {
  AgentStorage,
  TaskStorage,
  MessageStorage,
  BoardStorage,
  OrgStorage,
} from "./storage/index.ts";

// MCP
export { createOrchestrationMcpServer } from "./mcp/server.ts";

// Prompt builder
export { buildAgentSystemPrompt } from "./prompt-builder.ts";

// Delegation flow
export { handleChildCompletion } from "./delegation-flow.ts";
