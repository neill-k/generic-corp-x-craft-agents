import { createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk"

import type { McpToolDeps } from "../types.ts"
import { AgentStorage } from "../storage/agents.ts"
import { TaskStorage } from "../storage/tasks.ts"
import { OrgStorage } from "../storage/org.ts"
import { MessageStorage } from "../storage/messages.ts"
import { BoardStorage } from "../storage/board.ts"

import { delegateTaskTool } from "./tools/delegate-task.ts"
import { finishTaskTool } from "./tools/finish-task.ts"
import { listAgentsTool } from "./tools/list-agents.ts"
import { createAgentTool } from "./tools/create-agent.ts"
import { updateAgentTool } from "./tools/update-agent.ts"
import { deleteAgentTool } from "./tools/delete-agent.ts"
import { setOrgParentTool } from "./tools/set-org-parent.ts"
import { updateContextTool } from "./tools/update-context.ts"
import { sendMessageTool } from "./tools/send-message.ts"
import { readMessagesTool } from "./tools/read-messages.ts"
import { queryBoardTool } from "./tools/query-board.ts"
import { postToBoardTool } from "./tools/post-to-board.ts"

export type { McpToolDeps } from "../types.ts"

export type ToolTextResult = { content: Array<{ type: "text"; text: string }> }

export function toolText(text: string): ToolTextResult {
  return { content: [{ type: "text", text }] }
}

export function createOrchestrationMcpServer(deps: McpToolDeps) {
  const agents = new AgentStorage(deps.basePath)
  const tasks = new TaskStorage(deps.basePath)
  const org = new OrgStorage(deps.basePath)
  const messages = new MessageStorage(deps.basePath)
  const board = new BoardStorage(deps.basePath)

  return createSdkMcpServer({
    name: "orchestration",
    version: "1.0.0",
    tools: [
      ...delegateTaskTool(deps, tasks, agents),
      ...finishTaskTool(deps, tasks),
      ...listAgentsTool(deps, agents, org),
      ...createAgentTool(deps, agents),
      ...updateAgentTool(deps, agents),
      ...deleteAgentTool(deps, agents, org),
      ...setOrgParentTool(deps, org, agents),
      ...updateContextTool(deps),
      ...sendMessageTool(deps, messages),
      ...readMessagesTool(deps, messages),
      ...queryBoardTool(deps, board),
      ...postToBoardTool(deps, board),
    ],
  })
}
