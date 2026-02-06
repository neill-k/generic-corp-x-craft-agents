# CLAUDE.md — generic-corp-x-craft-agents

This is a **fork** of [lukilabs/craft-agents-oss](https://github.com/lukilabs/craft-agents-oss) with multi-agent orchestration features added from the [Generic Corp](https://github.com/neill-k/generic-corp) project.

## What This Fork Adds

Multi-agent orchestration on top of Craft Agents' Electron desktop app:

- **Agent hierarchy** — Agents with levels (IC → C-Suite) organized in an org chart tree
- **Task delegation** — Parent agents delegate tasks to children; results flow back up
- **Inter-agent messaging** — Direct messages between agents with threads
- **Kanban board** — Tasks visualized in columns (backlog → in_progress → review → done)
- **Board items** — Status updates, blockers, findings, requests
- **Orchestration MCP tools** — `delegate_task`, `finish_task`, `send_message`, `create_agent`, etc.
- **Agent creation** — Beautiful UI and natural language chat-based agent creation

## Architecture Overview

```
apps/
  electron/                 # Electron desktop app (main + renderer)
    src/
      main/                 # Node.js main process
        ipc-orchestration.ts  # NEW — Orchestration IPC handlers
      renderer/             # React UI (Vite + shadcn)
        pages/
          OrchestrationPage.tsx  # NEW — Main orchestration dashboard
packages/
  core/                     # Shared types (UNCHANGED)
  shared/                   # Business logic (minimal additions)
  ui/                       # UI components (UNCHANGED)
  mermaid/                  # Mermaid rendering (UNCHANGED)
  orchestration/            # NEW — Multi-agent orchestration engine
    src/
      engine.ts             # OrchestrationEngine class
      mcp/                  # Orchestration MCP server + tools
      storage/              # File-based state (agents, tasks, messages, board, org)
      prompt-builder.ts     # System prompt with identity/role/briefing
  orchestration-ui/         # NEW — React components for orchestration
    src/
      components/
        OrgChart/           # Org chart tree visualization
        Kanban/             # Kanban board
        AgentPanel/         # Agent detail + live stream
```

## Key Design Principles

1. **Upstream-compatible** — All orchestration features are in new packages or behind feature flags. Changes to existing Craft Agents code are minimal (~50 lines). This allows PRing changes back to upstream.
2. **File-first** — No database. All state (agents, tasks, messages, org tree, board) stored as JSON/MD files under `~/.craft-agent/workspaces/{id}/orchestration/`. Matches Craft Agents' philosophy.
3. **Feature-flagged** — Orchestration is opt-in via workspace config: `{ "orchestration": { "enabled": true } }`. When disabled, the app behaves exactly like upstream Craft Agents.
4. **Main agent gets everything** — When orchestration is enabled, the main chat agent has all orchestration MCP tools injected. Users can create agents, delegate tasks, and monitor via normal chat.
5. **Isolated agent directories** — Each spawned agent gets its own working directory at `workspaces/{id}/orchestration/agents/{agent-name}/`.

## Build & Development

```bash
# Install dependencies
bun install

# Development (hot reload)
bun run electron:dev

# Build and run
bun run electron:start

# Type checking
bun run typecheck:all

# Tests
bun test

# Run specific package tests
cd packages/orchestration && bun test
```

## Upstream Tracking

- `origin` → `neill-k/generic-corp-x-craft-agents` (this fork)
- `upstream` → `lukilabs/craft-agents-oss` (original Craft Agents)

To pull upstream changes:
```bash
git fetch upstream
git merge upstream/main
```

## Implementation Plan

See `plans/craft-agents-migration-plan.md` for the full, detailed migration plan including:
- Architectural gap analysis between Craft Agents and Generic Corp
- Package structure and module design
- MCP tool specifications
- UI component hierarchy
- Implementation phases (7 phases)
- Resolved design decisions

## Code Conventions

### Inherited from Craft Agents
- Bun runtime
- ESM modules (`"type": "module"`)
- React + Tailwind CSS v4 + shadcn/ui for UI
- Jotai for state management
- 2-space indentation, semicolons optional (match existing style)

### For New Orchestration Code
- TypeScript strict mode, avoid `any`
- `import type { ... }` for type-only imports
- File-based storage operations must be atomic (write temp file, then rename)
- All MCP tools follow the `tool()` pattern from `@anthropic-ai/claude-agent-sdk`
- Events use typed discriminated unions
- Tests colocated in `__tests__/` directories
- Error handling: `error instanceof Error ? error.message : "Unknown error"`
- Logging with component prefix: `[Orchestration]`, `[MCP]`, `[Engine]`

### Agent-Native Architecture (from Generic Corp)

All 8 principles must be maintained in new code:

1. **Action Parity** — Every UI action has a corresponding MCP tool
2. **Tools as Primitives** — Tools provide capability, not behavior (no business logic in handlers)
3. **Context Injection** — System prompt includes dynamic context (org structure, pending results, messages)
4. **Shared Workspace** — Agent and user see the same file-based state
5. **CRUD Completeness** — Full Create/Read/Update/Delete for agents, tasks, messages from both UI and MCP
6. **UI Integration** — All state mutations emit events. Agent actions immediately reflected in UI
7. **Capability Discovery** — Suggested prompts, empty state guidance, help documentation
8. **Prompt-Native Features** — Agent behavior defined by prompts (personality, role), not code

## Data Model (File-Based)

```
~/.craft-agent/workspaces/{id}/
  orchestration/
    agents/
      {agent-name}/
        config.json       # Agent identity: name, role, level, department, personality
        context.md        # Agent-owned working memory (agent controls this)
        results/          # Results delivered from child tasks
    org.json              # Org chart tree structure
    tasks/
      {taskId}.json       # Task state
    messages/
      {threadId}/
        {messageId}.json  # Inter-agent messages
    board/
      status-updates/     # Board items (markdown files)
      blockers/
      findings/
      requests/
```

## MCP Tools Available to Orchestration Agents

| Tool | Description |
|------|-------------|
| `create_agent` | Create a new agent with name, role, level, personality |
| `update_agent` | Modify an existing agent's config |
| `delete_agent` | Remove an agent from the organization |
| `set_org_parent` | Set/change an agent's manager in the org chart |
| `delegate_task` | Assign work to another agent by name |
| `finish_task` | Mark current task as done/blocked/failed with result |
| `send_message` | Send a direct message to another agent |
| `read_messages` | Read messages in current thread or all unread |
| `list_agents` | List all agents with their roles and statuses |
| `query_board` | Read recent board items (status updates, blockers) |
| `post_to_board` | Post a status update, blocker, or finding |
| `update_context` | Update agent's own context.md working memory |

## Reference Repository

The Generic Corp source repo at `/home/clagent/generic-corp` (or [on GitHub](https://github.com/neill-k/generic-corp)) contains the original implementations of:
- Prisma schema (`apps/server/prisma/schema.prisma`) — data model reference
- MCP tools (`apps/server/src/mcp/tools/`) — tool logic reference
- Prompt builder (`apps/server/src/services/prompt-builder.ts`) — system prompt reference
- Delegation flow (`apps/server/src/services/delegation-flow.ts`) — result delivery reference
- Dashboard components (`apps/dashboard/src/`) — UI pattern reference
- Shared types (`packages/shared/src/types.ts`) — type definitions reference
