# Migration Plan: Generic Corp Multi-Agent Orchestration → Craft Agents

> **Goal**: Fork Craft Agents and add Generic Corp's multi-agent orchestration features while keeping changes upstream-mergeable.
>
> **Constraints**: (1) Keep Electron desktop shell, (2) Focus on multi-agent orchestration, (3) Changes should be additive/modular enough to eventually PR back upstream to craft-agents.
>
> **Repository**: Published as fork at `github.com/neill-k/generic-corp-x-craft-agents`

---

## 1. Architectural Gap Analysis

### What Craft Agents Has (and we keep)
| Component | Details |
|-----------|---------|
| Electron shell | Main process (IPC, sessions, window management) + React renderer |
| CraftAgent class | Wraps `@anthropic-ai/claude-agent-sdk` `query()`, handles streaming, permissions, tools |
| Session management | JSONL file-based (SessionHeader + StoredMessages), workspace-scoped |
| Sources system | MCP servers (stdio/SSE/HTTP), REST APIs, local filesystems — modular, per-workspace |
| Skills | Markdown files per workspace, loaded into system prompt |
| Themes | Cascading JSON themes (app → workspace) |
| Permission modes | safe/ask/allow-all with per-session state |
| Credentials | AES-256-GCM encrypted file at `~/.craft-agent/credentials.enc` |
| State management | Jotai atoms in renderer, IPC bridge to main process |
| File storage | Everything at `~/.craft-agent/` — no database, no server process |

### What Generic Corp Has (and we're porting)
| Component | Details |
|-----------|---------|
| **Agent hierarchy** | Agents with levels (IC → C-Suite), organized in an org chart tree |
| **Task delegation** | Parent agents delegate tasks to children; results flow back up |
| **Agent lifecycle** | Spawn, monitor, terminate agents; track status (idle/running/error) |
| **Inter-agent messaging** | Direct messages between agents with threads, read status |
| **Org chart** | Tree structure: OrgNode model with parent-child relationships |
| **Kanban board** | Tasks visualized in columns (backlog → in_progress → review → done) |
| **Board items** | Status updates, blockers, findings, requests — file-based |
| **System prompt injection** | Per-agent identity, role, briefing, context injection |
| **Agent-owned memory** | `.gc/context.md` per agent (agent controls its own working memory) |
| **Child result delivery** | Results written to parent's `.gc/results/` directory |
| **MCP tools for orchestration** | `delegate_task`, `finish_task`, `send_message`, `query_board`, `list_agents`, etc. |
| **Real-time events** | WebSocket events for all state mutations (agent status, task status, messages, board) |
| **Cost/duration tracking** | Per-task cost in USD, duration in ms, number of turns |

### Fundamental Architecture Differences

| Dimension | Craft Agents | Generic Corp |
|-----------|-------------|--------------|
| **Deployment** | Electron desktop app | Web server + browser dashboard |
| **Runtime** | Bun | Node.js (pnpm) |
| **Data storage** | Files (JSON, JSONL) | PostgreSQL + Redis + files |
| **Agent model** | Single agent per session | Many concurrent agents in hierarchy |
| **Process model** | Agent SDK runs in main process | BullMQ queues, SDK invocations per task |
| **State** | Jotai atoms (client-side) | Prisma ORM (server-side) |
| **Real-time** | IPC (main ↔ renderer) | Socket.io WebSockets |
| **MCP integration** | Sources (user configures) | In-process `createSdkMcpServer` (platform provides) |
| **System prompts** | Skills + CLAUDE.md + preferences | Identity + role + briefing + context injection |

---

## 2. Design Principles for the Migration

### 2.1. Upstream-Compatible Architecture
Every feature should be added as a **new package** or **optional module** that doesn't break existing Craft Agents behavior:

```
packages/
  core/              # (existing) — no changes
  shared/            # (existing) — minimal changes (new exports, never remove)
  ui/                # (existing) — no changes
  mermaid/           # (existing) — no changes
  orchestration/     # NEW — multi-agent orchestration engine
  orchestration-ui/  # NEW — React components for org chart, kanban, agent panels
```

### 2.2. Feature Flag Gating
A single configuration toggle in workspace config enables orchestration mode:

```json
{
  "orchestration": {
    "enabled": true,
    "orgStructure": "path/to/org.json"
  }
}
```

When `orchestration.enabled` is false (default), Craft Agents behaves exactly as it does upstream. This makes it safe to PR back.

### 2.3. File-First (No Database Required)
Generic Corp uses PostgreSQL for relational data. We **will NOT add a database**. Instead, all state lives in files under the workspace directory, matching Craft Agents' philosophy:

```
~/.craft-agent/workspaces/{id}/
  orchestration/
    agents/
      {agent-name}/
        config.json       # Agent identity: role, level, department, personality
        context.md        # Agent-owned working memory
        results/          # Results from child tasks
          {timestamp}-{taskId}.md
    org.json              # Org chart tree structure
    tasks/
      {taskId}.json       # Task state (status, assignee, delegator, result)
    messages/
      {threadId}/
        {messageId}.json  # Inter-agent messages
    board/
      status-updates/     # Board items (markdown files)
      blockers/
      findings/
      requests/
```

This is a deliberate departure from Generic Corp's Prisma/PostgreSQL approach, but it:
- Keeps Craft Agents' file-first philosophy
- Requires no infrastructure (no Docker, no PostgreSQL, no Redis)
- Is consistent with how Craft Agents stores sessions, skills, and sources
- Allows git-versioning of agent configuration

**Trade-off**: We lose relational queries and indexing. For the scale of a desktop app (dozens of agents, hundreds of tasks), file-based is fine. We can add SQLite later if needed.

### 2.4. Agent Spawning via SDK (Not BullMQ)
Generic Corp uses BullMQ + Redis for agent task queues. We replace this with direct `query()` calls managed by an orchestration engine running in Electron's main process:

```typescript
// In packages/orchestration/src/engine.ts
class OrchestrationEngine {
  private runningAgents: Map<string, RunningAgent> = new Map();

  async spawnAgent(agentConfig: AgentConfig, task: TaskConfig): Promise<void> {
    const mcpServer = createOrchestrationMcpServer(agentConfig, this);

    for await (const event of query({
      prompt: task.prompt,
      options: {
        systemPrompt: buildAgentSystemPrompt(agentConfig, task),
        cwd: agentConfig.workspacePath,
        mcpServers: {
          "orchestration": { type: "sdk", instance: mcpServer },
          ...userSourceServers,  // Pass through user's configured sources
        },
        permissionMode: agentConfig.permissionMode,
      },
    })) {
      this.emitEvent(agentConfig.name, task.id, event);
    }
  }
}
```

---

## 3. New Package: `packages/orchestration`

This is the core addition. It contains all multi-agent orchestration logic as a pure TypeScript package with no Electron dependencies.

### 3.1. Module Structure

```
packages/orchestration/
  package.json
  tsconfig.json
  src/
    index.ts              # Public API
    engine.ts             # OrchestrationEngine class
    agent-config.ts       # Agent configuration types and loading
    agent-spawner.ts      # Wraps CraftAgent / SDK query() for spawning
    task-manager.ts       # CRUD operations on task files
    message-bus.ts        # Inter-agent message delivery
    org-tree.ts           # Org chart tree operations
    board-manager.ts      # Board items (status updates, blockers, etc.)
    delegation-flow.ts    # Parent → child task delegation and result delivery
    prompt-builder.ts     # System prompt assembly with identity + briefing
    mcp/
      server.ts           # createOrchestrationMcpServer()
      tools/
        delegate-task.ts
        finish-task.ts
        send-message.ts
        read-messages.ts
        list-agents.ts
        query-board.ts
        post-to-board.ts
        update-context.ts
    storage/
      agents.ts           # File-based agent config read/write
      tasks.ts            # File-based task state read/write
      messages.ts         # File-based message read/write
      board.ts            # File-based board items
      org.ts              # File-based org tree
    events.ts             # Event emitter for UI updates
    types.ts              # All orchestration types
    __tests__/            # Unit tests
```

### 3.2. Key Types

```typescript
// Agent identity and configuration
interface AgentConfig {
  name: string;           // Unique slug (e.g., "alice-pm")
  displayName: string;    // Human-readable name
  role: string;           // Job title
  department: string;     // Department
  level: AgentLevel;      // "ic" | "lead" | "manager" | "vp" | "c-suite"
  personality: string;    // Personality prompt fragment
  status: AgentStatus;    // "idle" | "running" | "error" | "offline"
  workspacePath: string;  // Working directory for this agent
}

// Task state
interface TaskState {
  id: string;
  parentTaskId: string | null;
  assigneeId: string;     // Agent name
  delegatorId: string | null;
  prompt: string;
  context: string | null;
  priority: number;
  status: TaskStatus;     // "pending" | "running" | "review" | "completed" | "failed" | "blocked"
  tags: TaskTag[];
  result: string | null;
  costUsd: number | null;
  durationMs: number | null;
  numTurns: number | null;
  createdAt: string;      // ISO timestamp
  startedAt: string | null;
  completedAt: string | null;
}

// Org chart node
interface OrgNode {
  agentName: string;
  parentAgentName: string | null;
  children: OrgNode[];
  position: number;
}

// Orchestration events (for UI binding)
type OrchestrationEvent =
  | { type: "agent_status_changed"; agentName: string; status: AgentStatus }
  | { type: "task_created"; taskId: string; assignee: string; delegator: string | null }
  | { type: "task_status_changed"; taskId: string; status: TaskStatus }
  | { type: "task_updated"; taskId: string }
  | { type: "message_created"; messageId: string; from: string | null; to: string; threadId: string }
  | { type: "agent_event"; agentName: string; taskId: string; event: AgentStreamEvent }
  | { type: "board_item_created"; itemType: string; author: string; path: string }
  | { type: "org_changed" };
```

### 3.3. MCP Tools (What Agents Get)

The orchestration MCP server gives each spawned agent these tools:

| Tool | Description | From GC? |
|------|-------------|----------|
| `delegate_task` | Assign work to another agent by name | Yes |
| `finish_task` | Mark current task as done/blocked/failed with result | Yes |
| `send_message` | Send a direct message to another agent | Yes |
| `read_messages` | Read messages in current thread or all unread | Yes |
| `list_agents` | List all agents with their roles and statuses | Yes |
| `query_board` | Read recent board items (status updates, blockers) | Yes |
| `post_to_board` | Post a status update, blocker, or finding | Yes |
| `update_context` | Update agent's own context.md working memory | Yes |

Each tool is scoped per-agent (the `agentName` and `taskId` are injected as closures, just like Generic Corp does with `deps`).

### 3.4. System Prompt Builder

Port Generic Corp's prompt builder approach. Each agent gets:

```
# Identity
You are {displayName}, a {role} in the {department} department.
You are at the {level} level in the organization.

# Personality
{personality}

# Organization Context
## Your Team
{subordinates list with roles}
## Your Manager
{manager name and role}

# Current Task
{task prompt and context}

# Pending Results
{any unread child task results}

# Communication Rules
- Use delegate_task to assign work to your reports
- Use finish_task when your work is complete
- Use send_message for coordination
- Use post_to_board for team-visible updates

# Working Memory
{contents of context.md}
```

This is assembled fresh per invocation (matches Generic Corp's `buildSystemPrompt` pattern).

---

## 4. New Package: `packages/orchestration-ui`

React components for the orchestration features, built with the same shadcn/ui + Tailwind stack as Craft Agents.

### 4.1. Components

```
packages/orchestration-ui/
  src/
    index.ts
    components/
      OrgChart/
        OrgChart.tsx           # Interactive org chart tree visualization
        OrgNode.tsx            # Single node (agent avatar + name + role + status)
        OrgEdge.tsx            # Connection lines between nodes
      Kanban/
        KanbanBoard.tsx        # Kanban board with columns
        KanbanColumn.tsx       # Single column (backlog, in_progress, review, done)
        KanbanCard.tsx         # Task card with assignee, priority, status
      AgentPanel/
        AgentPanel.tsx         # Side panel showing agent details
        AgentStatusBadge.tsx   # Status indicator (idle/running/error)
        AgentStream.tsx        # Live streaming output from a running agent
        AgentList.tsx          # List of all agents with quick actions
      TaskDetail/
        TaskDetail.tsx         # Task detail view with subtasks, results
        TaskTimeline.tsx       # Timeline of task status changes
      Board/
        BoardView.tsx          # Board items feed
        BoardItemCard.tsx      # Single board item
      MessageThread/
        MessageThread.tsx      # Inter-agent message thread view
        MessageComposer.tsx    # Compose a message to an agent
    hooks/
      useOrchestration.ts     # React hook for OrchestrationEngine state
      useAgents.ts            # Agent list + status subscription
      useTasks.ts             # Task list + filtering
      useOrgTree.ts           # Org tree data
    atoms/
      orchestration-atoms.ts  # Jotai atoms for orchestration state
```

### 4.2. Integration Point: Craft Agents Renderer

The renderer needs minimal changes — add new pages/views behind the orchestration feature flag:

```typescript
// In apps/electron/src/renderer/pages/ — NEW files, not modifications
OrchestrationPage.tsx    // Main orchestration dashboard
OrgChartPage.tsx         // Full-page org chart
KanbanPage.tsx           // Full-page kanban board
```

**Sidebar modification** (smallest possible change to existing code): Add an "Orchestration" section to the sidebar when `orchestration.enabled` is true. This is the main touchpoint with existing Craft Agents UI code.

---

## 5. Changes to Existing Craft Agents Code

These are the **minimal, additive** changes needed in existing packages. Each is designed to be upstream-safe.

### 5.1. `packages/shared` — New Exports Only

```typescript
// packages/shared/src/workspaces/types.ts — extend WorkspaceConfig type
// ADD optional field (backward compatible):
orchestration?: {
  enabled: boolean;
  orgStructure?: string;  // path to org.json
};
```

This is the only type modification needed. It's an optional field so it's fully backward compatible.

### 5.2. `apps/electron/src/main/` — New IPC Channels

Add new IPC handlers for orchestration operations (new file, not modifying existing ipc.ts):

```typescript
// apps/electron/src/main/ipc-orchestration.ts — NEW FILE
// Registers orchestration IPC channels:
// - orchestration:spawn-agent
// - orchestration:list-agents
// - orchestration:get-agent-status
// - orchestration:delegate-task
// - orchestration:get-tasks
// - orchestration:get-org-tree
// - orchestration:get-board-items
// - orchestration:subscribe-events
```

In the existing `main/index.ts`, add a single conditional import:

```typescript
// At the end of initialization, after existing IPC registration:
if (workspaceConfig?.orchestration?.enabled) {
  const { registerOrchestrationHandlers } = await import('./ipc-orchestration.js');
  registerOrchestrationHandlers(orchestrationEngine);
}
```

### 5.3. `apps/electron/src/renderer/` — New Pages

Add new React pages/components. The only modification to existing code is adding routes/navigation items behind feature flag checks.

### 5.4. `apps/electron/src/shared/types.ts` — New IPC Channel Constants

Add orchestration IPC channel constants (additive only).

---

## 6. Implementation Phases

### Phase 1: Foundation (packages/orchestration core)
**Goal**: File-based orchestration engine that can spawn agents and manage tasks.

1. Create `packages/orchestration` package scaffold
2. Implement file-based storage layer (agents, tasks, messages, board, org)
3. Implement `OrchestrationEngine` class with `spawnAgent()` and event emission
4. Implement MCP server with core tools (`delegate_task`, `finish_task`, `list_agents`)
5. Implement system prompt builder with identity/role/briefing injection
6. Implement delegation flow (parent → child task creation, result delivery)
7. Write comprehensive tests for all storage operations and engine logic

### Phase 2: Communication & Board
**Goal**: Inter-agent messaging and board system.

1. Implement `send_message` / `read_messages` MCP tools
2. Implement `post_to_board` / `query_board` MCP tools
3. Implement message threading and read status tracking
4. Implement board item management (status updates, blockers, findings, requests)
5. Tests for messaging and board operations

### Phase 3: Electron Integration
**Goal**: Wire orchestration engine into Electron main process.

1. Create `ipc-orchestration.ts` with all IPC handlers
2. Add orchestration engine initialization (gated by workspace config)
3. Add orchestration IPC channel constants to shared types
4. Wire event subscription (engine events → IPC → renderer)
5. Test IPC bridge end-to-end

### Phase 4: UI — Org Chart & Agent Management
**Goal**: Visual org chart and agent management in the renderer.

1. Create `packages/orchestration-ui` package
2. Implement `OrgChart` component (tree visualization)
3. Implement `AgentPanel` (detail view, status, stream output)
4. Implement `AgentList` (sidebar list of all agents)
5. Add "Orchestration" navigation to sidebar (behind feature flag)
6. Add `OrchestrationPage` as the main orchestration dashboard

### Phase 5: UI — Kanban & Task Management
**Goal**: Kanban board for task visualization.

1. Implement `KanbanBoard` with column-based task layout
2. Implement `KanbanCard` with drag-drop (optional)
3. Implement `TaskDetail` view with subtask tree
4. Implement task creation/delegation UI
5. Wire real-time updates (agent events → Jotai atoms → component re-renders)

### Phase 6: UI — Messages & Board
**Goal**: Message thread and board views.

1. Implement `MessageThread` component
2. Implement `BoardView` feed
3. Add message notifications
4. Wire board items to the dashboard

### Phase 7: Polish & Agent-Native Audit
**Goal**: Ensure all 8 agent-native principles are met.

1. Action Parity: Every UI action has a corresponding MCP tool
2. Tools as Primitives: Verify tools provide capability, not behavior
3. Context Injection: System prompt includes full dynamic context
4. Shared Workspace: Agents and user see the same file-based state
5. CRUD Completeness: Full create/read/update/delete from both UI and MCP
6. UI Integration: All events propagate to UI in real-time
7. Capability Discovery: Add suggested prompts, empty state guidance
8. Prompt-Native Features: Behavior defined by prompts, not code

---

## 7. Key Decisions & Trade-offs

### 7.1. File-Based vs. Database

**Decision**: File-based (no SQLite, no PostgreSQL)

**Rationale**:
- Matches Craft Agents' existing philosophy (sessions, skills, sources are all files)
- No infrastructure dependencies (no Docker, no database servers)
- Makes upstream PR more acceptable (no new dependencies)
- Git-versionable agent configurations
- Desktop app scale (< 100 agents, < 1000 tasks) doesn't need relational queries

**Risk**: Slower for complex queries (e.g., "all tasks assigned to X where status is running"). Mitigated by in-memory caching with file-watch invalidation.

**Escape hatch**: Can add SQLite later as an optional backing store without changing the API surface.

### 7.2. Agent Process Model

**Decision**: Multiple concurrent `query()` calls in Electron's main process

**Rationale**:
- Claude Agent SDK `query()` is async generator — multiple can run concurrently
- No need for BullMQ/Redis (those solve multi-machine distribution, not relevant for desktop)
- Main process is Node.js-compatible and can handle I/O-bound concurrent agents
- Events from each agent stream are forwarded to renderer via IPC

**Risk**: CPU-bound work in agent event processing could block main process. Mitigated by keeping event processing lightweight and using `setTimeout` for yielding.

**Concurrency limit**: Default to 3 concurrent agents (configurable). Queue additional tasks.

### 7.3. Permission Model for Spawned Agents

**Decision**: Spawned agents inherit the workspace permission mode by default, with per-agent overrides possible in agent config.

**Rationale**:
- User already trusts the permission mode they've set
- Agent-specific overrides allow restricting untrusted agents further
- Matches the "prompt-level trust" principle from Generic Corp

### 7.4. What We're NOT Porting

| Generic Corp Feature | Reason for Exclusion |
|---------------------|---------------------|
| PostgreSQL/Prisma | Replaced with file-based storage |
| Redis/BullMQ | Replaced with in-process concurrency |
| Express server | Not needed — Electron main process handles everything |
| Socket.io | Replaced with Electron IPC |
| Multi-tenant (`Tenant` model) | Desktop app is single-user |
| Workspace model (DB) | Craft Agents already has workspace management |
| REST API routes | Not needed — all communication is IPC |
| `McpServerConfig` model | Craft Agents already has Sources system |
| `ToolPermission` model | Craft Agents already has permission modes |

---

## 8. Resolved Decisions

### Q1: Agent Working Directories
**Decision**: Isolated subdirectories — each agent gets `workspaces/{id}/orchestration/agents/{agent-name}/` as its working directory. This provides filesystem isolation between agents, prevents accidental file conflicts, and matches Generic Corp's per-agent workspace approach.

### Q2: How Do Users Create Agents?
**Decision**: Beautiful UI + chat-based creation.

**UI path**: A polished agent creation form in the orchestration dashboard — name, display name, role, department, level, personality. Visual, guided, with sensible defaults and live preview of how the agent will appear in the org chart.

**Chat path**: The main agent gets a `create_agent` MCP tool. Users can say "create a PM agent named Alice who manages the engineering team" and the agent creates it via tool call. This also requires a **Craft Agents skill** (`orchestration.md`) that teaches the main agent how to use orchestration tools effectively — how to create agents, build org structures, delegate work, etc.

**Agent Creation Skill** (installed as a workspace skill):
```markdown
# Orchestration Skill

You have access to multi-agent orchestration tools. You can:

## Creating Agents
Use `create_agent` to add new agents to the organization:
- Choose meaningful names (kebab-case slugs)
- Assign clear roles that define what the agent does
- Set the right level (ic, lead, manager, vp, c-suite)
- Write personality prompts that shape the agent's behavior

## Delegating Work
Use `delegate_task` to assign work to agents:
- Be specific in task prompts
- Include relevant context
- Set priority (higher = more urgent)

## Monitoring
Use `list_agents` to see who's available
Use `query_board` to see recent activity
Use `read_messages` to check communications

## Organization
Use `set_org_parent` to build the reporting hierarchy
Think about team structure before creating agents
```

### Q3: Main Chat Agent Access
**Decision**: Yes — the main chat agent always gets orchestration MCP tools when orchestration is enabled. The orchestration MCP server is injected alongside the existing preferences and source servers. Users can delegate tasks, create agents, check status — all from the normal chat interface.

### Q4: Publication Strategy
**Decision**: Published as a fork at `generic-corp-x-craft-agents`. Changes are structured to be upstream-mergeable (additive packages, feature-flagged), allowing future PRs back to `lukilabs/craft-agents-oss` if the Craft team is interested.

### Q5: Additional MCP Tools (resolved from Q2)
Adding these tools to the orchestration MCP server (beyond the original 8):

| Tool | Description |
|------|-------------|
| `create_agent` | Create a new agent with name, role, level, personality |
| `update_agent` | Modify an existing agent's config |
| `delete_agent` | Remove an agent from the organization |
| `set_org_parent` | Set/change an agent's manager in the org chart |

---

## 9. Dependency Map

```
packages/orchestration          ← depends on → packages/shared (types only)
                                ← depends on → @anthropic-ai/claude-agent-sdk
                                ← depends on → zod

packages/orchestration-ui       ← depends on → packages/orchestration (types + hooks)
                                ← depends on → packages/ui (shared UI components)
                                ← depends on → react, jotai, lucide-react, tailwind

apps/electron/src/main/         ← imports   → packages/orchestration (engine)
apps/electron/src/renderer/     ← imports   → packages/orchestration-ui (components)
```

No changes to `packages/core`, `packages/ui`, or `packages/mermaid`.

---

## 10. Estimated Package Sizes

| Package | Files | Lines (est.) | Complexity |
|---------|-------|-------------|------------|
| `packages/orchestration` | ~25 | ~3,000 | High — core engine, MCP tools, storage |
| `packages/orchestration-ui` | ~20 | ~2,500 | Medium — React components, Jotai atoms |
| Electron integration | ~5 | ~500 | Low — IPC bridge, conditional initialization |
| Existing code changes | ~3 | ~50 | Minimal — type extension, navigation, imports |

**Total new code**: ~6,000 lines across ~50 files.
**Total changes to existing code**: ~50 lines across ~3 files.
