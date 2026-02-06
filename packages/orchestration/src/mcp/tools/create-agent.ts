import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import { AGENT_LEVELS } from "../../constants.ts"
import type { McpToolDeps, AgentConfig } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import { toolText } from "../server.ts"

export function createAgentTool(deps: McpToolDeps, agents: AgentStorage) {
  return [
    tool(
      "create_agent",
      "Create a new agent in the organization",
      {
        name: z.string().regex(/^[a-z0-9-]+$/).describe("Unique slug name (lowercase, numbers, hyphens)"),
        displayName: z.string().describe("Human-readable name"),
        role: z.string().describe("Agent's role title"),
        department: z.string().describe("Department name"),
        level: z.enum(AGENT_LEVELS).describe("Agent level in the hierarchy"),
        personality: z.string().optional().describe("Personality/behavior description"),
      },
      async (args) => {
        try {
          const existing = await agents.get(args.name)
          if (existing) return toolText(`Agent already exists: ${args.name}`)

          const now = new Date().toISOString()
          const agent: AgentConfig = {
            name: args.name,
            displayName: args.displayName,
            role: args.role,
            department: args.department,
            level: args.level,
            personality: args.personality ?? "",
            status: "idle",
            currentTaskId: null,
            avatarColor: null,
            createdAt: now,
            updatedAt: now,
          }

          await agents.save(agent)
          await agents.ensureAgentDir(args.name)

          deps.emit("agent_created", { agentName: args.name })

          return toolText(JSON.stringify({ name: agent.name, displayName: agent.displayName }, null, 2))
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`create_agent failed: ${msg}`)
        }
      },
    ),
  ]
}
