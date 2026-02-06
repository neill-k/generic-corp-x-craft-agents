import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import type { McpToolDeps } from "../../types.ts"
import type { MessageStorage } from "../../storage/messages.ts"
import { toolText } from "../server.ts"

export function readMessagesTool(deps: McpToolDeps, messages: MessageStorage) {
  return [
    tool(
      "read_messages",
      "Read messages in a thread or list all unread messages",
      {
        threadId: z.string().optional().describe("Thread ID to read. If omitted, returns all unread messages."),
      },
      async (args) => {
        try {
          if (args.threadId) {
            const threadMessages = await messages.listThread(args.threadId)
            // Mark them read
            for (const msg of threadMessages) {
              if (msg.toAgentId === deps.agentName && msg.status !== "read") {
                await messages.markRead(msg.id, args.threadId)
              }
            }
            return toolText(JSON.stringify(threadMessages.map(m => ({
              id: m.id,
              from: m.fromAgentId,
              to: m.toAgentId,
              subject: m.subject,
              body: m.body,
              createdAt: m.createdAt,
              status: m.status,
            })), null, 2))
          }

          const unread = await messages.getUnread(deps.agentName)
          return toolText(JSON.stringify(unread.map(m => ({
            id: m.id,
            from: m.fromAgentId,
            threadId: m.threadId,
            subject: m.subject,
            body: m.body,
            createdAt: m.createdAt,
          })), null, 2))
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`read_messages failed: ${msg}`)
        }
      },
    ),
  ]
}
