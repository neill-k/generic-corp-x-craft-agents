export const AGENT_LEVELS = ["ic", "lead", "manager", "vp", "c-suite"] as const;

export const AGENT_STATUSES = ["idle", "running", "error", "offline"] as const;

export const TASK_STATUSES = ["pending", "running", "review", "completed", "failed", "blocked"] as const;

export const KANBAN_COLUMNS = ["backlog", "in_progress", "review", "done"] as const;

export const BOARD_ITEM_TYPES = ["status_update", "blocker", "finding", "request"] as const;

export const BOARD_TYPE_TO_FOLDER: Record<BoardItemType, string> = {
  status_update: "status-updates",
  blocker: "blockers",
  finding: "findings",
  request: "requests",
};

export const STATUS_TO_COLUMN: Record<TaskStatus, KanbanColumn> = {
  pending: "backlog",
  running: "in_progress",
  review: "review",
  completed: "done",
  failed: "done",
  blocked: "backlog",
};

// Import types for the mappings above
import type { BoardItemType, TaskStatus, KanbanColumn } from "./types.ts";
