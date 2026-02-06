import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { randomUUID } from "node:crypto"
import type { McpToolDeps, Message } from "../../types.ts"
import type { MessageStorage } from "../../storage/messages.ts"
import { toolText } from "../server.ts"

export function sendMessageTool(deps: McpToolDeps, messages: MessageStorage) {
  return [
    tool(
      "send_message",
      "Send a direct message to another agent",
      {
        toAgent: z.string().describe("Name of the recipient agent"),
        subject: z.string().optional().describe("Message subject"),
        body: z.string().describe("Message body"),
        threadId: z.string().optional().describe("Existing thread ID to reply to"),
      },
      async (args) => {
        try {
          const threadId = args.threadId ?? randomUUID()
          const message: Message = {
            id: randomUUID(),
            fromAgentId: deps.agentName,
            toAgentId: args.toAgent,
            threadId,
            subject: args.subject ?? null,
            body: args.body,
            type: "direct",
            status: "delivered",
            createdAt: new Date().toISOString(),
            readAt: null,
          }
          await messages.save(message)
          deps.emit("message_created", {
            messageId: message.id,
            from: deps.agentName,
            to: args.toAgent,
            threadId,
          })
          return toolText(`Message sent to ${args.toAgent} (thread ${threadId.slice(0, 8)}).`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`send_message failed: ${msg}`)
        }
      },
    ),
  ]
}
