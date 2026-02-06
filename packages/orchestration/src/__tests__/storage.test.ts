import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { AgentStorage } from "../storage/agents.ts"
import { TaskStorage } from "../storage/tasks.ts"
import { MessageStorage } from "../storage/messages.ts"
import { BoardStorage } from "../storage/board.ts"
import { OrgStorage } from "../storage/org.ts"
import type { AgentConfig, TaskState, Message, BoardItem } from "../types.ts"

// ── Helpers ──────────────────────────────────────────────────────────

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

function makeMessage(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg-1",
    fromAgentId: "sender",
    toAgentId: "receiver",
    threadId: "thread-1",
    subject: "Hello",
    body: "Test message body",
    type: "direct",
    status: "pending",
    createdAt: new Date().toISOString(),
    readAt: null,
    ...overrides,
  }
}

function makeBoardItem(overrides: Partial<BoardItem> = {}): BoardItem {
  return {
    id: "item-1",
    type: "status_update",
    author: "test-agent",
    summary: "Test summary",
    body: "Test body content",
    createdAt: new Date().toISOString(),
    path: "",
    ...overrides,
  }
}

// ═════════════════════════════════════════════════════════════════════
// AgentStorage
// ═════════════════════════════════════════════════════════════════════

describe("AgentStorage", () => {
  let tmpDir: string
  let storage: AgentStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    storage = new AgentStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and retrieves an agent", async () => {
    const agent = makeAgent()
    await storage.save(agent)
    const retrieved = await storage.get("test-agent")
    expect(retrieved).toEqual(agent)
  })

  it("returns null for missing agent", async () => {
    const result = await storage.get("nonexistent")
    expect(result).toBeNull()
  })

  it("lists agents when empty", async () => {
    const agents = await storage.list()
    expect(agents).toEqual([])
  })

  it("lists one agent", async () => {
    await storage.save(makeAgent())
    const agents = await storage.list()
    expect(agents).toHaveLength(1)
    expect(agents[0]!.name).toBe("test-agent")
  })

  it("lists multiple agents", async () => {
    await storage.save(makeAgent({ name: "alice" }))
    await storage.save(makeAgent({ name: "bob" }))
    const agents = await storage.list()
    expect(agents).toHaveLength(2)
    const names = agents.map(a => a.name).sort()
    expect(names).toEqual(["alice", "bob"])
  })

  it("deletes an agent", async () => {
    await storage.save(makeAgent())
    await storage.delete("test-agent")
    const result = await storage.get("test-agent")
    expect(result).toBeNull()
  })

  it("exists returns true for existing agent", async () => {
    await storage.save(makeAgent())
    expect(await storage.exists("test-agent")).toBe(true)
  })

  it("exists returns false for missing agent", async () => {
    expect(await storage.exists("nonexistent")).toBe(false)
  })
})

// ═════════════════════════════════════════════════════════════════════
// TaskStorage
// ═════════════════════════════════════════════════════════════════════

describe("TaskStorage", () => {
  let tmpDir: string
  let storage: TaskStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    storage = new TaskStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and retrieves a task", async () => {
    const task = makeTask()
    await storage.save(task)
    const retrieved = await storage.get("task-1")
    expect(retrieved).toEqual(task)
  })

  it("returns null for missing task", async () => {
    const result = await storage.get("nonexistent")
    expect(result).toBeNull()
  })

  it("lists tasks when empty", async () => {
    const tasks = await storage.list()
    expect(tasks).toEqual([])
  })

  it("lists tasks with assigneeId filter", async () => {
    await storage.save(makeTask({ id: "t1", assigneeId: "alice" }))
    await storage.save(makeTask({ id: "t2", assigneeId: "bob" }))
    const tasks = await storage.list({ assigneeId: "alice" })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.assigneeId).toBe("alice")
  })

  it("lists tasks with status filter", async () => {
    await storage.save(makeTask({ id: "t1", status: "pending" }))
    await storage.save(makeTask({ id: "t2", status: "running" }))
    const tasks = await storage.list({ status: "running" })
    expect(tasks).toHaveLength(1)
    expect(tasks[0]!.status).toBe("running")
  })

  it("sorts tasks by createdAt descending", async () => {
    const older = makeTask({ id: "t-old", createdAt: "2024-01-01T00:00:00.000Z" })
    const newer = makeTask({ id: "t-new", createdAt: "2024-06-01T00:00:00.000Z" })
    await storage.save(older)
    await storage.save(newer)
    const tasks = await storage.list()
    expect(tasks[0]!.id).toBe("t-new")
    expect(tasks[1]!.id).toBe("t-old")
  })

  it("deletes a task", async () => {
    await storage.save(makeTask())
    await storage.delete("task-1")
    const result = await storage.get("task-1")
    expect(result).toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
// MessageStorage
// ═════════════════════════════════════════════════════════════════════

describe("MessageStorage", () => {
  let tmpDir: string
  let storage: MessageStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    storage = new MessageStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and retrieves a message", async () => {
    const msg = makeMessage()
    await storage.save(msg)
    const retrieved = await storage.get("msg-1", "thread-1")
    expect(retrieved).toEqual(msg)
  })

  it("returns null for missing message", async () => {
    const result = await storage.get("nonexistent", "thread-1")
    expect(result).toBeNull()
  })

  it("listThread returns messages sorted by createdAt ascending", async () => {
    const older = makeMessage({
      id: "msg-old",
      createdAt: "2024-01-01T00:00:00.000Z",
    })
    const newer = makeMessage({
      id: "msg-new",
      createdAt: "2024-06-01T00:00:00.000Z",
    })
    await storage.save(newer)
    await storage.save(older)
    const messages = await storage.listThread("thread-1")
    expect(messages[0]!.id).toBe("msg-old")
    expect(messages[1]!.id).toBe("msg-new")
  })

  it("listThread returns empty array for missing thread", async () => {
    const messages = await storage.listThread("nonexistent")
    expect(messages).toEqual([])
  })

  it("listThreads returns thread IDs", async () => {
    await storage.save(makeMessage({ id: "m1", threadId: "thread-a" }))
    await storage.save(makeMessage({ id: "m2", threadId: "thread-b" }))
    const threads = await storage.listThreads()
    expect(threads.sort()).toEqual(["thread-a", "thread-b"])
  })

  it("listThreads returns empty array when no messages exist", async () => {
    const threads = await storage.listThreads()
    expect(threads).toEqual([])
  })

  it("getUnread filters by agent and status", async () => {
    await storage.save(makeMessage({
      id: "m1",
      toAgentId: "alice",
      status: "pending",
      threadId: "t1",
    }))
    await storage.save(makeMessage({
      id: "m2",
      toAgentId: "alice",
      status: "read",
      threadId: "t1",
    }))
    await storage.save(makeMessage({
      id: "m3",
      toAgentId: "bob",
      status: "pending",
      threadId: "t1",
    }))
    const unread = await storage.getUnread("alice")
    expect(unread).toHaveLength(1)
    expect(unread[0]!.id).toBe("m1")
  })

  it("markRead updates status and readAt", async () => {
    const msg = makeMessage()
    await storage.save(msg)
    await storage.markRead("msg-1", "thread-1")
    const updated = await storage.get("msg-1", "thread-1")
    expect(updated!.status).toBe("read")
    expect(updated!.readAt).not.toBeNull()
  })
})

// ═════════════════════════════════════════════════════════════════════
// BoardStorage
// ═════════════════════════════════════════════════════════════════════

describe("BoardStorage", () => {
  let tmpDir: string
  let storage: BoardStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    storage = new BoardStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and retrieves a board item", async () => {
    const item = makeBoardItem()
    await storage.save(item)
    const retrieved = await storage.get("status_update", "item-1")
    expect(retrieved).not.toBeNull()
    expect(retrieved!.id).toBe("item-1")
    expect(retrieved!.type).toBe("status_update")
    expect(retrieved!.author).toBe("test-agent")
    expect(retrieved!.summary).toBe("Test summary")
    expect(retrieved!.body).toBe("Test body content")
  })

  it("returns null for missing board item", async () => {
    const result = await storage.get("status_update", "nonexistent")
    expect(result).toBeNull()
  })

  it("returns null for invalid type", async () => {
    const result = await storage.get("invalid_type", "item-1")
    expect(result).toBeNull()
  })

  it("lists items with type filter", async () => {
    await storage.save(makeBoardItem({ id: "i1", type: "status_update" }))
    await storage.save(makeBoardItem({ id: "i2", type: "blocker" }))
    const items = await storage.list({ type: "status_update" })
    expect(items).toHaveLength(1)
    expect(items[0]!.id).toBe("i1")
  })

  it("lists items with author filter", async () => {
    await storage.save(makeBoardItem({ id: "i1", author: "alice" }))
    await storage.save(makeBoardItem({ id: "i2", author: "bob" }))
    const items = await storage.list({ author: "alice" })
    expect(items).toHaveLength(1)
    expect(items[0]!.author).toBe("alice")
  })

  it("lists items with limit", async () => {
    await storage.save(makeBoardItem({ id: "i1", createdAt: "2024-01-01T00:00:00.000Z" }))
    await storage.save(makeBoardItem({ id: "i2", createdAt: "2024-06-01T00:00:00.000Z" }))
    await storage.save(makeBoardItem({ id: "i3", createdAt: "2024-12-01T00:00:00.000Z" }))
    const items = await storage.list({ limit: 2 })
    expect(items).toHaveLength(2)
  })

  it("sorts items by createdAt descending", async () => {
    await storage.save(makeBoardItem({ id: "i-old", createdAt: "2024-01-01T00:00:00.000Z" }))
    await storage.save(makeBoardItem({ id: "i-new", createdAt: "2024-06-01T00:00:00.000Z" }))
    const items = await storage.list()
    expect(items[0]!.id).toBe("i-new")
    expect(items[1]!.id).toBe("i-old")
  })

  it("lists all types when no type filter", async () => {
    await storage.save(makeBoardItem({ id: "i1", type: "status_update" }))
    await storage.save(makeBoardItem({ id: "i2", type: "blocker" }))
    await storage.save(makeBoardItem({ id: "i3", type: "finding" }))
    await storage.save(makeBoardItem({ id: "i4", type: "request" }))
    const items = await storage.list()
    expect(items).toHaveLength(4)
  })
})

// ═════════════════════════════════════════════════════════════════════
// OrgStorage
// ═════════════════════════════════════════════════════════════════════

describe("OrgStorage", () => {
  let tmpDir: string
  let storage: OrgStorage

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
    storage = new OrgStorage(tmpDir)
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("saves and retrieves a tree", async () => {
    const tree = { roots: [] }
    await storage.save(tree)
    const retrieved = await storage.get()
    expect(retrieved).toEqual(tree)
  })

  it("returns empty tree when file does not exist", async () => {
    const tree = await storage.get()
    expect(tree).toEqual({ roots: [] })
  })

  it("setParent adds root node when parentAgentName is null", async () => {
    await storage.setParent("ceo", null)
    const tree = await storage.get()
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.agentName).toBe("ceo")
    expect(tree.roots[0]!.parentAgentName).toBeNull()
  })

  it("setParent adds child node", async () => {
    await storage.setParent("ceo", null)
    await storage.setParent("vp-eng", "ceo")
    const tree = await storage.get()
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.children).toHaveLength(1)
    expect(tree.roots[0]!.children[0]!.agentName).toBe("vp-eng")
    expect(tree.roots[0]!.children[0]!.parentAgentName).toBe("ceo")
  })

  it("getParent returns parent name", async () => {
    await storage.setParent("ceo", null)
    await storage.setParent("vp-eng", "ceo")
    const parent = await storage.getParent("vp-eng")
    expect(parent).toBe("ceo")
  })

  it("getParent returns null for root node", async () => {
    await storage.setParent("ceo", null)
    const parent = await storage.getParent("ceo")
    expect(parent).toBeNull()
  })

  it("getParent returns null for nonexistent agent", async () => {
    const parent = await storage.getParent("nonexistent")
    expect(parent).toBeNull()
  })

  it("getChildren returns child nodes", async () => {
    await storage.setParent("ceo", null)
    await storage.setParent("vp-eng", "ceo")
    await storage.setParent("vp-sales", "ceo")
    const children = await storage.getChildren("ceo")
    expect(children).toHaveLength(2)
    const names = children.map(c => c.agentName).sort()
    expect(names).toEqual(["vp-eng", "vp-sales"])
  })

  it("getChildren returns empty for leaf node", async () => {
    await storage.setParent("ceo", null)
    const children = await storage.getChildren("ceo")
    expect(children).toEqual([])
  })

  it("removeAgent reparents children to parent", async () => {
    await storage.setParent("ceo", null)
    await storage.setParent("vp-eng", "ceo")
    await storage.setParent("eng-1", "vp-eng")
    await storage.setParent("eng-2", "vp-eng")

    await storage.removeAgent("vp-eng")

    const tree = await storage.get()
    // ceo should still be root
    expect(tree.roots).toHaveLength(1)
    expect(tree.roots[0]!.agentName).toBe("ceo")
    // eng-1 and eng-2 should now be children of ceo
    const children = tree.roots[0]!.children
    expect(children).toHaveLength(2)
    const names = children.map(c => c.agentName).sort()
    expect(names).toEqual(["eng-1", "eng-2"])
    // and their parentAgentName should be updated
    for (const child of children) {
      expect(child.parentAgentName).toBe("ceo")
    }
  })

  it("removeAgent reparents children to root when removing root", async () => {
    await storage.setParent("ceo", null)
    await storage.setParent("vp-eng", "ceo")
    await storage.setParent("vp-sales", "ceo")

    await storage.removeAgent("ceo")

    const tree = await storage.get()
    expect(tree.roots).toHaveLength(2)
    const names = tree.roots.map(r => r.agentName).sort()
    expect(names).toEqual(["vp-eng", "vp-sales"])
    for (const root of tree.roots) {
      expect(root.parentAgentName).toBeNull()
    }
  })

  it("removeAgent is a no-op for nonexistent agent", async () => {
    await storage.setParent("ceo", null)
    await storage.removeAgent("nonexistent")
    const tree = await storage.get()
    expect(tree.roots).toHaveLength(1)
  })
})
