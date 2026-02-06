import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"
import { randomUUID } from "node:crypto"

import type { McpToolDeps, TaskState } from "../../types.ts"
import type { AgentStorage } from "../../storage/agents.ts"
import type { TaskStorage } from "../../storage/tasks.ts"
import { toolText } from "../server.ts"

export function delegateTaskTool(
  deps: McpToolDeps,
  tasks: TaskStorage,
  agents: AgentStorage,
) {
  return [
    tool(
      "delegate_task",
      "Assign work to another agent by name",
      {
        targetAgent: z.string().describe("Name (slug) of the agent to delegate to"),
        prompt: z.string().describe("What to do"),
        context: z.string().describe("Relevant context"),
        priority: z.number().int().optional().describe("Higher is more urgent"),
      },
      async (args) => {
        try {
          const caller = await agents.get(deps.agentName)
          if (!caller) return toolText(`Unknown caller agent: ${deps.agentName}`)

          const target = await agents.get(args.targetAgent)
          if (!target) return toolText(`Unknown agent: ${args.targetAgent}`)

          const now = new Date().toISOString()
          const task: TaskState = {
            id: randomUUID(),
            parentTaskId: deps.taskId || null,
            assigneeId: target.name,
            delegatorId: deps.agentName,
            prompt: args.prompt,
            context: args.context,
            priority: args.priority ?? 0,
            status: "pending",
            tags: [],
            result: null,
            costUsd: null,
            durationMs: null,
            numTurns: null,
            createdAt: now,
            startedAt: null,
            completedAt: null,
          }

          await tasks.save(task)

          deps.emit("task_created", {
            taskId: task.id,
            assignee: target.name,
            delegator: deps.agentName,
          })

          return toolText(`Delegated to ${target.name}. Task ${task.id} queued.`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`delegate_task failed: ${msg}`)
        }
      },
    ),
  ]
}
