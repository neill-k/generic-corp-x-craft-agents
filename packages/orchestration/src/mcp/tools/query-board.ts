import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { BOARD_ITEM_TYPES } from "../../constants.ts"
import type { McpToolDeps } from "../../types.ts"
import type { BoardStorage } from "../../storage/board.ts"
import { toolText } from "../server.ts"

export function queryBoardTool(_deps: McpToolDeps, board: BoardStorage) {
  return [
    tool(
      "query_board",
      "Read recent board items (status updates, blockers, findings, requests)",
      {
        type: z.enum(BOARD_ITEM_TYPES).optional().describe("Filter by item type"),
        author: z.string().optional().describe("Filter by author agent name"),
        limit: z.number().int().optional().describe("Max results (default 10)"),
      },
      async (args) => {
        try {
          const items = await board.list({
            type: args.type,
            author: args.author,
            limit: args.limit ?? 10,
          })
          return toolText(JSON.stringify(items.map(i => ({
            id: i.id,
            type: i.type,
            author: i.author,
            summary: i.summary,
            body: i.body,
            createdAt: i.createdAt,
          })), null, 2))
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`query_board failed: ${msg}`)
        }
      },
    ),
  ]
}
