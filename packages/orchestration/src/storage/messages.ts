import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import type { Message } from "../types.ts"

export class MessageStorage {
  private messagesDir: string

  constructor(basePath: string) {
    this.messagesDir = join(basePath, "messages")
  }

  async save(message: Message): Promise<void> {
    const threadDir = join(this.messagesDir, message.threadId)
    await mkdir(threadDir, { recursive: true })
    const filePath = join(threadDir, `${message.id}.json`)
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(message, null, 2))
    await rename(tmpPath, filePath)
  }

  async get(messageId: string, threadId: string): Promise<Message | null> {
    try {
      const filePath = join(this.messagesDir, threadId, `${messageId}.json`)
      const data = await readFile(filePath, "utf-8")
      return JSON.parse(data) as Message
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }

  async listThread(threadId: string): Promise<Message[]> {
    try {
      const threadDir = join(this.messagesDir, threadId)
      const entries = await readdir(threadDir)
      const messages: Message[] = []
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue
        const msg = await this.get(entry.replace(".json", ""), threadId)
        if (msg) messages.push(msg)
      }
      return messages.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }

  async listThreads(): Promise<string[]> {
    try {
      const entries = await readdir(this.messagesDir, { withFileTypes: true })
      return entries.filter(e => e.isDirectory()).map(e => e.name)
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }

  async getUnread(agentName: string): Promise<Message[]> {
    const threads = await this.listThreads()
    const unread: Message[] = []
    for (const threadId of threads) {
      const messages = await this.listThread(threadId)
      for (const msg of messages) {
        if (msg.toAgentId === agentName && msg.status !== "read") {
          unread.push(msg)
        }
      }
    }
    return unread.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  async markRead(messageId: string, threadId: string): Promise<void> {
    const message = await this.get(messageId, threadId)
    if (!message) return
    message.status = "read"
    message.readAt = new Date().toISOString()
    await this.save(message)
  }
}
