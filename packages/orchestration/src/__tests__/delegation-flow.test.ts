import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { mkdtemp, rm, readdir, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { handleChildCompletion } from "../delegation-flow.ts"

describe("handleChildCompletion", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "orch-test-"))
  })

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true })
  })

  it("creates results directory under parent agent", async () => {
    await handleChildCompletion(
      tmpDir,
      "child-task-1",
      "Task completed successfully",
      "completed",
      "parent-task-1",
      "parent-agent",
    )

    const resultsDir = join(tmpDir, "agents", "parent-agent", "results")
    const entries = await readdir(resultsDir)
    expect(entries).toHaveLength(1)
  })

  it("writes markdown file with correct content", async () => {
    await handleChildCompletion(
      tmpDir,
      "child-task-1",
      "Found 3 issues",
      "completed",
      "parent-task-1",
      "parent-agent",
    )

    const resultsDir = join(tmpDir, "agents", "parent-agent", "results")
    const entries = await readdir(resultsDir)
    const content = await readFile(join(resultsDir, entries[0]!), "utf-8")

    expect(content).toContain("# Child Task Result")
    expect(content).toContain("child-task-1")
    expect(content).toContain("completed")
    expect(content).toContain("Found 3 issues")
  })

  it("handles null result gracefully", async () => {
    await handleChildCompletion(
      tmpDir,
      "child-task-2",
      null,
      "failed",
      "parent-task-1",
      "parent-agent",
    )

    const resultsDir = join(tmpDir, "agents", "parent-agent", "results")
    const entries = await readdir(resultsDir)
    const content = await readFile(join(resultsDir, entries[0]!), "utf-8")

    expect(content).toContain("(no result provided)")
    expect(content).toContain("failed")
  })

  it("file name includes timestamp and task ID", async () => {
    await handleChildCompletion(
      tmpDir,
      "abc-123",
      "result",
      "completed",
      "parent-task-1",
      "parent-agent",
    )

    const resultsDir = join(tmpDir, "agents", "parent-agent", "results")
    const entries = await readdir(resultsDir)
    const fileName = entries[0]!

    expect(fileName).toEndWith(".md")
    expect(fileName).toContain("abc-123")
    // Should contain ISO-like timestamp parts (year, month)
    expect(fileName).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})
