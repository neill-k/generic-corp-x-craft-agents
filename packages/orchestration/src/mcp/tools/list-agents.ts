import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { AGENT_STATUSES } from "../../constants.ts"
import type { McpToolDeps, AgentStatus } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import type { OrgStorage } from "../../storage/org.ts"
import { toolText } from "../server.ts"

export function listAgentsTool(
  _deps: McpToolDeps,
  agents: AgentStorage,
  org: OrgStorage,
) {
  return [
    tool(
      "list_agents",
      "List all agents in the organization",
      {
        department: z.string().optional().describe("Filter by department"),
        status: z.enum(AGENT_STATUSES).optional().describe("Filter by status"),
      },
      async (args) => {
        try {
          let result = await agents.list()

          if (args.department) {
            result = result.filter((a) => a.department === args.department)
          }
          if (args.status) {
            result = result.filter((a) => a.status === (args.status as AgentStatus))
          }

          const formatted = await Promise.all(result.map(async (a) => {
            const parentName = await org.getParent(a.name)
            const children = await org.getChildren(a.name)
            return {
              name: a.name,
              displayName: a.displayName,
              role: a.role,
              department: a.department,
              level: a.level,
              status: a.status,
              currentTaskId: a.currentTaskId,
              parentAgentName: parentName,
              directReports: children.map(c => c.agentName),
            }
          }))

          return toolText(JSON.stringify(formatted, null, 2))
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`list_agents failed: ${msg}`)
        }
      },
    ),
  ]
}
