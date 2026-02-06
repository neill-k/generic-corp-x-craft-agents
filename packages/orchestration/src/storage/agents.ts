import { readFile, writeFile, readdir, mkdir, rm, rename } from "node:fs/promises"
import { join } from "node:path"
import type { AgentConfig } from "../types.ts"

export class AgentStorage {
  private agentsDir: string

  constructor(basePath: string) {
    this.agentsDir = join(basePath, "agents")
  }

  async save(agent: AgentConfig): Promise<void> {
    const dir = await this.ensureAgentDir(agent.name)
    const filePath = join(dir, "config.json")
    const tmpPath = `${filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(agent, null, 2))
    await rename(tmpPath, filePath)
  }

  async get(name: string): Promise<AgentConfig | null> {
    try {
      const filePath = join(this.agentsDir, name, "config.json")
      const data = await readFile(filePath, "utf-8")
      return JSON.parse(data) as AgentConfig
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return null
      }
      throw error
    }
  }

  async list(): Promise<AgentConfig[]> {
    try {
      const entries = await readdir(this.agentsDir, { withFileTypes: true })
      const agents: AgentConfig[] = []
      for (const entry of entries) {
        if (entry.isDirectory()) {
          const agent = await this.get(entry.name)
          if (agent) agents.push(agent)
        }
      }
      return agents
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return []
      }
      throw error
    }
  }

  async delete(name: string): Promise<void> {
    const dir = join(this.agentsDir, name)
    await rm(dir, { recursive: true, force: true })
  }

  async exists(name: string): Promise<boolean> {
    const agent = await this.get(name)
    return agent !== null
  }

  async ensureAgentDir(name: string): Promise<string> {
    const dir = join(this.agentsDir, name)
    await mkdir(dir, { recursive: true })
    return dir
  }
}
