import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { OrchestrationEngine } from "../engine.ts"
import type { AgentConfig, TaskState, OrchestrationEventMap } from "../types.ts"

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    displayName: "Test Agent",
    role: "Engineer",
    department: "Engineering",
    level: "ic",
    personality: "Hardworking",
    status: "idle",
    currentTaskId: null,
    avatarColor: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

function makeTask(overrides: Partial<TaskState> = {}): TaskState {
  return {
    id: "task-1",
    parentTaskId: null,
    assigneeId: "test-agent",
    delegatorId: null,
    prompt: "Do something",
    context: null,
    priority: 0,
    status: "pending",
    tags: [],
    result: null,
    costUsd: null,
    durationMs: null,
    numTurns: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    ...overrides,
  }
}

describe("OrchestrationEngine", () => {
  let tmpDir: string
  let engine: OrchestrationEngine

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    engine = new OrchestrationEngine(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  describe("initialize", () => {
    it("creates directory structure", async () => {
      await engine.initialize()

      const dirs = ["agents", "tasks", "messages", "board"]
      for (const dir of dirs) {
        const info = await stat(join(tmpDir, dir))
        expect(info.isDirectory()).toBe(true)
      }
    })
  })

  describe("createTask", () => {
    it("creates a task and emits event", async () => {
      const events: Array<OrchestrationEventMap["task_created"]> = []
      engine.on("task_created", (e) => events.push(e))

      const task = await engine.createTask("test-agent", "Do work", null, null, null)

      expect(task.assigneeId).toBe("test-agent")
      expect(task.prompt).toBe("Do work")
      expect(task.status).toBe("pending")
      expect(task.id).toBeTruthy()

      // Verify persisted
      const retrieved = await engine.getTask(task.id)
      expect(retrieved).not.toBeNull()
      expect(retrieved!.prompt).toBe("Do work")

      // Verify event
      expect(events).toHaveLength(1)
      expect(events[0]!.assignee).toBe("test-agent")
    })

    it("sets priority and context", async () => {
      const task = await engine.createTask("agent", "prompt", "some context", "delegator", null, 5)
      expect(task.priority).toBe(5)
      expect(task.context).toBe("some context")
      expect(task.delegatorId).toBe("delegator")
    })
  })

  describe("getAgent and listAgents", () => {
    it("delegates to storage", async () => {
      await engine.initialize()
      const agent = makeAgent()
      await engine.agents.save(agent)

      const retrieved = await engine.getAgent("test-agent")
      expect(retrieved).toEqual(agent)

      const list = await engine.listAgents()
      expect(list).toHaveLength(1)
      expect(list[0]!.name).toBe("test-agent")
    })
  })

  describe("getTask and listTasks", () => {
    it("delegates to storage", async () => {
      await engine.initialize()
      const task = makeTask()
      await engine.tasks.save(task)

      const retrieved = await engine.getTask("task-1")
      expect(retrieved).toEqual(task)

      const list = await engine.listTasks()
      expect(list).toHaveLength(1)
      expect(list[0]!.id).toBe("task-1")
    })
  })

  describe("getOrgTree", () => {
    it("delegates to storage", async () => {
      const tree = await engine.getOrgTree()
      expect(tree).toEqual({ roots: [] })
    })
  })

  describe("event subscription", () => {
    it("on/emit works", () => {
      const events: string[] = []
      engine.on("agent_status_changed", (e) => events.push(e.agentName))
      engine.emit("agent_status_changed", { agentName: "foo", status: "running" })
      expect(events).toEqual(["foo"])
    })

    it("unsubscribe stops handler", () => {
      const events: string[] = []
      const unsub = engine.on("agent_status_changed", (e) => events.push(e.agentName))
      unsub()
      engine.emit("agent_status_changed", { agentName: "foo", status: "running" })
      expect(events).toEqual([])
    })
  })

  describe("completeAgent", () => {
    it("updates task and agent status", async () => {
      await engine.initialize()

      // Save agent and task
      const agent = makeAgent({ status: "running", currentTaskId: "task-1" })
      await engine.agents.save(agent)
      const task = makeTask({ status: "running" })
      await engine.tasks.save(task)

      // Track events
      const taskEvents: string[] = []
      const agentEvents: string[] = []
      engine.on("task_status_changed", (e) => taskEvents.push(e.status))
      engine.on("agent_status_changed", (e) => agentEvents.push(e.status))

      await engine.completeAgent("test-agent", "task-1", "completed", "All done")

      // Check task
      const updatedTask = await engine.getTask("task-1")
      expect(updatedTask!.status).toBe("completed")
      expect(updatedTask!.result).toBe("All done")
      expect(updatedTask!.completedAt).not.toBeNull()

      // Check agent
      const updatedAgent = await engine.getAgent("test-agent")
      expect(updatedAgent!.status).toBe("idle")
      expect(updatedAgent!.currentTaskId).toBeNull()

      // Check events
      expect(taskEvents).toEqual(["completed"])
      expect(agentEvents).toEqual(["idle"])
    })

    it("records cost, duration, and numTurns when provided", async () => {
      await engine.initialize()
      await engine.agents.save(makeAgent({ status: "running" }))
      await engine.tasks.save(makeTask({ status: "running" }))

      await engine.completeAgent("test-agent", "task-1", "completed", "done", 0.05, 5000, 3)

      const task = await engine.getTask("task-1")
      expect(task!.costUsd).toBe(0.05)
      expect(task!.durationMs).toBe(5000)
      expect(task!.numTurns).toBe(3)
    })
  })

  describe("concurrency", () => {
    it("setConcurrencyLimit updates the limit", () => {
      engine.setConcurrencyLimit(10)
      // No direct getter, but we can verify it doesn't throw
      expect(engine.getRunningAgentCount()).toBe(0)
    })

    it("isAgentRunning returns false for non-running agent", () => {
      expect(engine.isAgentRunning("nonexistent")).toBe(false)
    })
  })

  describe("listBoardItems", () => {
    it("delegates to board storage", async () => {
      const items = await engine.listBoardItems()
      expect(items).toEqual([])
    })
  })

  describe("getUnreadMessages", () => {
    it("delegates to message storage", async () => {
      const msgs = await engine.getUnreadMessages("agent")
      expect(msgs).toEqual([])
    })
  })
})
