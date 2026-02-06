import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { McpToolDeps } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import { toolText } from "../server.ts"

export function updateAgentTool(deps: McpToolDeps, agents: AgentStorage) {
  return [
    tool(
      "update_agent",
      "Update an agent's properties",
      {
        agentName: z.string().describe("Agent name (slug)"),
        displayName: z.string().optional().describe("New display name"),
        role: z.string().optional().describe("New role title"),
        department: z.string().optional().describe("New department"),
        personality: z.string().optional().describe("New personality description"),
      },
      async (args) => {
        try {
          const agent = await agents.get(args.agentName)
          if (!agent) return toolText(`Unknown agent: ${args.agentName}`)

          let changed = false
          if (args.displayName !== undefined) { agent.displayName = args.displayName; changed = true }
          if (args.role !== undefined) { agent.role = args.role; changed = true }
          if (args.department !== undefined) { agent.department = args.department; changed = true }
          if (args.personality !== undefined) { agent.personality = args.personality; changed = true }

          if (!changed) return toolText("No fields to update.")

          agent.updatedAt = new Date().toISOString()
          await agents.save(agent)

          deps.emit("agent_updated", { agentName: args.agentName })

          return toolText(`Agent ${args.agentName} updated.`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`update_agent failed: ${msg}`)
        }
      },
    ),
  ]
}
