import { readFile, writeFile, readdir, mkdir, rename } from "node:fs/promises"
import { join } from "node:path"
import { BOARD_TYPE_TO_FOLDER } from "../constants.ts"
import type { BoardItem, BoardItemType } from "../types.ts"

export class BoardStorage {
  private boardDir: string

  constructor(basePath: string) {
    this.boardDir = join(basePath, "board")
  }

  async save(item: BoardItem): Promise<void> {
    const folder = BOARD_TYPE_TO_FOLDER[item.type]
    const dir = join(this.boardDir, folder)
    await mkdir(dir, { recursive: true })
    const filePath = join(dir, `${item.id}.md`)
    const content = this.toMarkdown(item)
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, content)
    await rename(tmpPath, filePath)
  }

  async list(filter?: { type?: string; author?: string; limit?: number }): Promise<BoardItem[]> {
    const items: BoardItem[] = []
    const types = filter?.type
      ? [filter.type as BoardItemType]
      : (Object.keys(BOARD_TYPE_TO_FOLDER) as BoardItemType[])

    for (const type of types) {
      const folder = BOARD_TYPE_TO_FOLDER[type]
      const dir = join(this.boardDir, folder)
      try {
        const entries = await readdir(dir)
        for (const entry of entries) {
          if (!entry.endsWith(".md")) continue
          const item = await this.get(type, entry.replace(".md", ""))
          if (!item) continue
          if (filter?.author && item.author !== filter.author) continue
          items.push(item)
        }
      } catch (error) {
        if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
          continue
        }
        throw error
      }
    }

    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    if (filter?.limit) {
      return items.slice(0, filter.limit)
    }
    return items
  }

  async get(type: string, id: string): Promise<BoardItem | null> {
    try {
      const folder = BOARD_TYPE_TO_FOLDER[type as BoardItemType]
      if (!folder) return null
      const filePath = join(this.boardDir, folder, `${id}.md`)
      const content = await readFile(filePath, "utf-8")
      return this.fromMarkdown(content, filePath)
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }

  private toMarkdown(item: BoardItem): string {
    const frontmatter = [
      "---",
      `id: ${item.id}`,
      `type: ${item.type}`,
      `author: ${item.author}`,
      `summary: ${item.summary}`,
      `createdAt: ${item.createdAt}`,
      "---",
    ].join("\n")
    return `${frontmatter}\n\n${item.body}\n`
  }

  private fromMarkdown(content: string, filePath: string): BoardItem | null {
    const match = content.match(/^---\n([\s\S]*?)\n---\n\n?([\s\S]*)$/)
    if (!match?.[1] || match[2] === undefined) return null

    const frontmatter = match[1]
    const body = match[2].trimEnd()

    const fields: Record<string, string> = {}
    for (const line of frontmatter.split("\n")) {
      const colonIdx = line.indexOf(":")
      if (colonIdx === -1) continue
      const key = line.slice(0, colonIdx).trim()
      const value = line.slice(colonIdx + 1).trim()
      fields[key] = value
    }

    return {
      id: fields.id ?? "",
      type: fields.type as BoardItemType,
      author: fields.author ?? "",
      summary: fields.summary ?? "",
      body,
      createdAt: fields.createdAt ?? "",
      path: filePath,
    }
  }
}
