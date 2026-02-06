import { mkdir, writeFile, rename } from "node:fs/promises";
import path from "node:path";

/**
 * Handle the completion of a child task by writing the result
 * to the parent agent's results/ directory.
 *
 * Adapted from Generic Corp's delegation-flow.ts for file-based storage.
 */
export async function handleChildCompletion(
  basePath: string,
  childTaskId: string,
  childResult: string | null,
  childStatus: string,
  parentTaskId: string,
  parentAgentName: string,
): Promise<void> {
  const resultsDir = path.join(basePath, "agents", parentAgentName, "results");
  await mkdir(resultsDir, { recursive: true });

  const now = new Date();
  const fileName = `${now.toISOString().replace(/[:.]/g, "-")}-${childTaskId}.md`;

  const body = `# Child Task Result

**Task ID**: ${childTaskId}
**Status**: ${childStatus}
**Completed**: ${now.toISOString()}

---

${childResult?.trim() ?? "(no result provided)"}
`;

  const filePath = path.join(resultsDir, fileName);
  const tmpPath = `${filePath}.tmp`;
  await writeFile(tmpPath, body, "utf8");
  await rename(tmpPath, filePath);
}
