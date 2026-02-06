import { tool } from "@anthropic-ai/claude-agent-sdk"
import { z } from "zod"

import type { McpToolDeps } from "../../types.ts"
import type { TaskStorage } from "../../storage/tasks.ts"
import { handleChildCompletion } from "../../delegation-flow.ts"
import { toolText } from "../server.ts"

export function finishTaskTool(deps: McpToolDeps, tasks: TaskStorage) {
  return [
    tool(
      "finish_task",
      "Mark your current task as completed, blocked, or failed with a result summary",
      {
        status: z.enum(["completed", "blocked", "failed"]).describe("Final task status"),
        result: z.string().describe("Result summary or reason for blocking/failure"),
      },
      async (args) => {
        try {
          const task = await tasks.get(deps.taskId)
          if (!task) return toolText(`Unknown task: ${deps.taskId}`)

          task.status = args.status
          task.result = args.result
          task.completedAt = new Date().toISOString()

          await tasks.save(task)

          deps.emit("task_status_changed", {
            taskId: deps.taskId,
            status: args.status,
          })

          // Deliver result to parent agent if this was a delegated task
          if (task.parentTaskId && task.delegatorId) {
            const parentTask = await tasks.get(task.parentTaskId)
            if (parentTask) {
              await handleChildCompletion(
                deps.basePath,
                deps.taskId,
                args.result,
                args.status,
                task.parentTaskId,
                parentTask.assigneeId,
              )
            }
          }

          return toolText(`Task ${deps.taskId} marked as ${args.status}.`)
        } catch (error) {
          const msg = error instanceof Error ? error.message : "Unknown error"
          return toolText(`finish_task failed: ${msg}`)
        }
      },
    ),
  ]
}
