import { readFile, writeFile, mkdir, rename } from "node:fs/promises"
import { join, dirname } from "node:path"
import type { OrgTree, OrgNode } from "../types.ts"

export class OrgStorage {
  private filePath: string

  constructor(basePath: string) {
    this.filePath = join(basePath, "org.json")
  }

  async save(tree: OrgTree): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true })
    const tmpPath = `${this.filePath}.tmp`
    await writeFile(tmpPath, JSON.stringify(tree, null, 2))
    await rename(tmpPath, this.filePath)
  }

  async get(): Promise<OrgTree> {
    try {
      const data = await readFile(this.filePath, "utf-8")
      return JSON.parse(data) as OrgTree
    } catch (error) {
      if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
        return { roots: [] }
      }
      throw error
    }
  }

  async setParent(agentName: string, parentAgentName: string | null): Promise<void> {
    const tree = await this.get()

    // Remove from current position
    this.removeFromTree(tree, agentName)

    // Create the node
    const node: OrgNode = {
      agentName,
      parentAgentName,
      children: [],
      position: 0,
    }

    if (parentAgentName === null) {
      // Add as root
      node.position = tree.roots.length
      tree.roots.push(node)
    } else {
      // Find parent and add as child
      const parent = this.findNode(tree.roots, parentAgentName)
      if (parent) {
        node.position = parent.children.length
        parent.children.push(node)
      } else {
        // Parent doesn't exist in tree yet, add as root
        node.position = tree.roots.length
        tree.roots.push(node)
      }
    }

    await this.save(tree)
  }

  async getParent(agentName: string): Promise<string | null> {
    const tree = await this.get()
    const node = this.findNode(tree.roots, agentName)
    return node?.parentAgentName ?? null
  }

  async getChildren(agentName: string): Promise<OrgNode[]> {
    const tree = await this.get()
    const node = this.findNode(tree.roots, agentName)
    return node?.children ?? []
  }

  async removeAgent(agentName: string): Promise<void> {
    const tree = await this.get()
    const node = this.findNode(tree.roots, agentName)
    if (!node) return

    const parentName = node.parentAgentName
    const orphans = node.children

    // Remove the agent from the tree
    this.removeFromTree(tree, agentName)

    // Reparent children to the removed agent's parent
    for (const child of orphans) {
      child.parentAgentName = parentName
      if (parentName === null) {
        child.position = tree.roots.length
        tree.roots.push(child)
      } else {
        const parent = this.findNode(tree.roots, parentName)
        if (parent) {
          child.position = parent.children.length
          parent.children.push(child)
        } else {
          child.position = tree.roots.length
          tree.roots.push(child)
        }
      }
    }

    await this.save(tree)
  }

  private findNode(nodes: OrgNode[], agentName: string): OrgNode | null {
    for (const node of nodes) {
      if (node.agentName === agentName) return node
      const found = this.findNode(node.children, agentName)
      if (found) return found
    }
    return null
  }

  private removeFromTree(tree: OrgTree, agentName: string): void {
    tree.roots = tree.roots.filter(n => n.agentName !== agentName)
    this.removeFromChildren(tree.roots, agentName)
  }

  private removeFromChildren(nodes: OrgNode[], agentName: string): void {
    for (const node of nodes) {
      node.children = node.children.filter(n => n.agentName !== agentName)
      this.removeFromChildren(node.children, agentName)
    }
  }
}
