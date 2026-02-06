import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { join } from "node:path"
import { writeFile, mkdir, rename } from "node:fs/promises"

import type { McpToolDeps } from "../../types.ts"
import { toolText } from "../server.ts"

export function updateContextTool(deps: McpToolDeps) {
  return [
    tool(
      "update_context",
      "Update your own context.md working memory",
      {
        content: z.string().describe("New content for your context.md file"),
      },
      async (args) => {
        try {
          const agentDir = join(deps.basePath, "agents", deps.agentName)
          await mkdir(agentDir, { recursive: true })

          const contextPath = join(agentDir, "context.md")
          const tmpPath = `${contextPath}.tmp`
          await writeFile(tmpPath, args.content, "utf-8")
          await rename(tmpPath, contextPath)

          return toolText(`context.md updated for ${deps.agentName}.`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`update_context failed: ${msg}`)
        }
      },
    ),
  ]
}
