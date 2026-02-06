import { describe, it, expect } from "bun:test"
import { buildAgentSystemPrompt } from "../prompt-builder.ts"
import type { BuildSystemPromptParams, AgentConfig, TaskState } from "../types.ts"

function makeAgent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: "test-agent",
    displayName: "Test Agent",
    role: "Software Engineer",
    department: "Engineering",
    level: "ic",
    personality: "Detail-oriented and thorough.",
    status: "running",
    currentTaskId: "task-1",
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
    prompt: "Write unit tests",
    context: "For the orchestration package",
    priority: 1,
    status: "running",
    tags: [],
    result: null,
    costUsd: null,
    durationMs: null,
    numTurns: null,
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    ...overrides,
  }
}

describe("buildAgentSystemPrompt", () => {
  it("includes agent identity (name, role, department, level)", () => {
    const prompt = buildAgentSystemPrompt({ agent: makeAgent(), task: makeTask() })
    expect(prompt).toContain("Software Engineer")
    expect(prompt).toContain("Engineering")
    expect(prompt).toContain("Test Agent")
    expect(prompt).toContain("test-agent")
    expect(prompt).toContain("ic")
  })

  it("includes personality", () => {
    const prompt = buildAgentSystemPrompt({ agent: makeAgent(), task: makeTask() })
    expect(prompt).toContain("Detail-oriented and thorough.")
  })

  it("includes current task details", () => {
    const prompt = buildAgentSystemPrompt({ agent: makeAgent(), task: makeTask() })
    expect(prompt).toContain("task-1")
    expect(prompt).toContain("Write unit tests")
    expect(prompt).toContain("For the orchestration package")
  })

  it("shows 'Human (via chat)' when no delegator", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask({ delegatorId: null }),
    })
    expect(prompt).toContain("Human (via chat)")
  })

  it("shows delegator display name when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask({ delegatorId: "manager" }),
      delegatorDisplayName: "Manager Bot",
    })
    expect(prompt).toContain("Manager Bot")
  })

  it("shows 'Another agent' when delegator exists but no display name", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask({ delegatorId: "manager" }),
    })
    expect(prompt).toContain("Another agent")
  })

  it("includes manager info when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      manager: { name: "CTO Bot", role: "CTO", status: "idle" },
    })
    expect(prompt).toContain("CTO Bot")
    expect(prompt).toContain("CTO")
    expect(prompt).toContain("Reports to")
  })

  it("shows no manager when manager is null", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      manager: null,
    })
    expect(prompt).toContain("you are the top of your chain")
  })

  it("includes org reports when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      orgReports: [
        { name: "junior-dev", role: "Junior Developer", status: "idle", currentTask: null },
        { name: "senior-dev", role: "Senior Developer", status: "running", currentTask: "task-2" },
      ],
    })
    expect(prompt).toContain("junior-dev")
    expect(prompt).toContain("Senior Developer")
    expect(prompt).toContain("Direct reports")
  })

  it("shows no direct reports when orgReports is empty", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      orgReports: [],
    })
    expect(prompt).toContain("Direct reports**: none")
  })

  it("includes pending results when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      pendingResults: [
        { childTaskId: "child-1", result: "Found 3 bugs" },
      ],
    })
    expect(prompt).toContain("Pending Results")
    expect(prompt).toContain("child-1")
    expect(prompt).toContain("Found 3 bugs")
  })

  it("omits pending results section when not provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
    })
    expect(prompt).not.toContain("Pending Results")
  })

  it("includes board items when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      recentBoardItems: [
        { type: "blocker", author: "dev-1", summary: "API down", timestamp: "2024-01-01T00:00:00.000Z" },
      ],
    })
    expect(prompt).toContain("Board Activity")
    expect(prompt).toContain("blocker")
    expect(prompt).toContain("API down")
  })

  it("omits board items section when not provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
    })
    expect(prompt).not.toContain("Board Activity")
  })

  it("includes context.md when provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
      contextMd: "## My notes\nRemember to check edge cases.",
    })
    expect(prompt).toContain("Working Memory")
    expect(prompt).toContain("Remember to check edge cases")
  })

  it("omits working memory section when contextMd is not provided", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask(),
    })
    expect(prompt).not.toContain("Working Memory")
  })

  it("shows (none provided) when task context is empty", () => {
    const prompt = buildAgentSystemPrompt({
      agent: makeAgent(),
      task: makeTask({ context: null }),
    })
    expect(prompt).toContain("(none provided)")
  })
})
