import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { McpToolDeps } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import type { OrgStorage } from "../../storage/org.ts"
import { toolText } from "../server.ts"

export function setOrgParentTool(
  deps: McpToolDeps,
  org: OrgStorage,
  agents: AgentStorage,
) {
  return [
    tool(
      "set_org_parent",
      "Set or change an agent's manager in the org chart",
      {
        agentName: z.string().describe("Agent name (slug) to move"),
        parentAgentName: z.string().nullable().describe("Parent agent name, or null for root"),
      },
      async (args) => {
        try {
          const agent = await agents.get(args.agentName)
          if (!agent) return toolText(`Unknown agent: ${args.agentName}`)

          if (args.parentAgentName !== null) {
            const parent = await agents.get(args.parentAgentName)
            if (!parent) return toolText(`Unknown parent agent: ${args.parentAgentName}`)
          }

          await org.setParent(args.agentName, args.parentAgentName)

          deps.emit("org_changed", {})

          return toolText(
            args.parentAgentName
              ? `${args.agentName} now reports to ${args.parentAgentName}.`
              : `${args.agentName} set as root (no manager).`,
          )
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`set_org_parent failed: ${msg}`)
        }
      },
    ),
  ]
}
