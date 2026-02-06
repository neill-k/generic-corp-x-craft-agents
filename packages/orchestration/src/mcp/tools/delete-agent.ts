import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { McpToolDeps } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import type { OrgStorage } from "../../storage/org.ts"
import { toolText } from "../server.ts"

export function deleteAgentTool(
  deps: McpToolDeps,
  agents: AgentStorage,
  org: OrgStorage,
) {
  return [
    tool(
      "delete_agent",
      "Remove an agent from the organization",
      {
        agentName: z.string().describe("Agent name (slug) to remove"),
      },
      async (args) => {
        try {
          const agent = await agents.get(args.agentName)
          if (!agent) return toolText(`Unknown agent: ${args.agentName}`)

          if (agent.status === "running") {
            return toolText(
              `Cannot delete agent ${args.agentName}: currently running task ${agent.currentTaskId}. ` +
              `Wait for the task to complete or cancel it first.`
            )
          }

          await agents.delete(args.agentName)
          await org.removeAgent(args.agentName)

          deps.emit("agent_deleted", { agentName: args.agentName })

          return toolText(`Agent ${args.agentName} deleted.`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`delete_agent failed: ${msg}`)
        }
      },
    ),
  ]
}
