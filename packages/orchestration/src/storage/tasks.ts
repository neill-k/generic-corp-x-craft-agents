import { readFile, writeFile, readdir, mkdir, rm, rename } from "node:fs/promises"
import { join } from "node:path"
import type { TaskState } from "../types.ts"

export class TaskStorage {
  private tasksDir: string

  constructor(basePath: string) {
    this.tasksDir = join(basePath, "tasks")
  }

  async save(task: TaskState): Promise<void> {
    await mkdir(this.tasksDir, { recursive: true })
    const filePath = join(this.tasksDir, `${task.id}.json`)
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(task, null, 2))
    await rename(tmpPath, filePath)
  }

  async get(id: string): Promise<TaskState | null> {
    try {
      const filePath = join(this.tasksDir, `${id}.json`)
      const data = await readFile(filePath, "utf-8")
      return JSON.parse(data) as TaskState
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }

  async list(filter?: { assigneeId?: string; status?: string }): Promise<TaskState[]> {
    try {
      const entries = await readdir(this.tasksDir)
      const tasks: TaskState[] = []
      for (const entry of entries) {
        if (!entry.endsWith(".json") || entry.endsWith(".tmp")) continue
        const id = entry.replace(".json", "")
        const task = await this.get(id)
        if (!task) continue
        if (filter?.assigneeId && task.assigneeId !== filter.assigneeId) continue
        if (filter?.status && task.status !== filter.status) continue
        tasks.push(task)
      }
      return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }

  async delete(id: string): Promise<void> {
    const filePath = join(this.tasksDir, `${id}.json`)
    await rm(filePath, { force: true })
  }
}
