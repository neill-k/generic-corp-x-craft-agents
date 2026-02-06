import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import { BOARD_ITEM_TYPES } from "../../constants.ts"
import type { McpToolDeps, BoardItem } from "../../types.ts"
import type { BoardStorage } from "../../storage/board.ts"
import { toolText } from "../server.ts"

export function postToBoardTool(deps: McpToolDeps, board: BoardStorage) {
  return [
    tool(
      "post_to_board",
      "Post a status update, blocker, finding, or request to the shared board",
      {
        type: z.enum(BOARD_ITEM_TYPES).describe("Type of board item"),
        summary: z.string().describe("Short summary (one line)"),
        body: z.string().describe("Full content"),
      },
      async (args) => {
        try {
          const item: BoardItem = {
            id: randomUUID(),
            type: args.type,
            author: deps.agentName,
            summary: args.summary,
            body: args.body,
            createdAt: new Date().toISOString(),
            path: "",
          }
          await board.save(item)
          deps.emit("board_item_created", {
            itemType: args.type,
            author: deps.agentName,
            path: item.path,
          })
          return toolText(`Board item posted: [${args.type}] ${args.summary}`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`post_to_board failed: ${msg}`)
        }
      },
    ),
  ]
}
