# Plan 003: Expose validated actions as first-class MCP tools

> **Executor instructions**: Add named read tools while preserving the existing generic tools. Tool discovery must be deterministic and must not execute browser code.
>
> **Drift check**: `git diff --stat b8ba22e..HEAD -- src/mcp.ts src/server.ts src/readAction.ts src/generator/skillPackage.ts tests/server.spec.ts`.

## Status

- **Execution**: DONE on 2026-09-06
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/001-typed-action-contract.md, plans/002-declarative-extension-executor.md
- **Category**: direction
- **Planned at**: commit `b8ba22e`, 2026-09-06

## Why this matters

`src/mcp.ts:7-18` currently exposes only `browserforge_list_actions` and `browserforge_run_read_action`. Agents must first discover a domain/action pair and then call a generic tool, which spends context on BrowserForge mechanics. Named tools such as `rdms_list_deployment_instances` let the model select a business operation directly while reusing the same server and bridge.

## Current state

- `src/mcp.ts:42-64` implements a small JSON-RPC stdio server with `tools/list` and `tools/call`.
- `src/server.ts:99-145` lists and runs actions through `/api/actions` and `/api/actions/run`; it already validates input before enqueueing the bridge task.
- MCP tool responses currently include serialized JSON text and `structuredContent`; tool errors are returned inside the result with `isError: true`.
- The service is local at `http://127.0.0.1:8787`; the extension is the only allowed CORS origin for bridge operations.

## Scope

**In scope**

- `src/mcp.ts`
- `src/server.ts` and a small action registry/helper module if needed
- `src/readAction.ts`, `src/generator/skillPackage.ts`
- `tests/server.spec.ts` and a new `tests/mcp.spec.ts`
- README MCP setup and tool behavior section.

**Out of scope**

- Write tools, direct API adapters, remote hosting/authentication, or MCP resources/prompts.
- Publishing actions lacking explicit metadata or validation.

## Steps

### Step 1: Build a deterministic published-tool registry

Load validated references from `skills/<domain>/` and select only `published: true`, `mode: "read"` actions. Derive a stable namespaced name (for example `rdms_list_deployment_instances`), description, input schema, output schema, and domain/action routing metadata. Sort tools by name. Reject collisions and invalid names at load time.

**Verify**: unit tests produce the same ordered list across repeated loads and reject a collision without starting the bridge.

### Step 2: Advertise complete MCP schemas

Update `initialize` capabilities to accurately describe the tool list behavior. `tools/list` must return each published tool with `inputSchema` and optional `outputSchema`; retain generic BrowserForge tools for backward compatibility, clearly marking them as advanced/internal in their descriptions. Follow the MCP rule that tool failures are result-level errors and preserve serialized text alongside structured content.

**Verify**: `npm test -- tests/mcp.spec.ts` asserts `tools/list`, schema equality with the reference, deterministic ordering, and a structured error for an invalid input.

### Step 3: Route named calls through the existing server endpoint

For a named tool call, translate the registry entry to `{ domain, action, input }` and call `/api/actions/run`. Do not duplicate bridge execution logic in `src/mcp.ts`. Preserve `503` for a disconnected extension and map it to an MCP tool result with `isError: true`.

**Verify**: server tests prove named and generic calls enqueue the same action and both fail safely when the bridge is disconnected.

### Step 4: Add documentation and an operator visibility hook

Update `README.md` with the MCP command, how to start the local service and extension, how published tools are selected, and the exact current-tab scope requirement. Add a concise log or response field identifying the invoked tool/action and duration; do not log page text, cookies, or tool inputs containing secrets.

**Verify**: `npm run typecheck` and `npm test` pass; README names the actual `npm run mcp` and `npm run serve` commands.

## Done criteria

- [ ] Named published read tools appear in `tools/list` without a prior model call.
- [ ] Named tools use the same bridge and validation path as generic actions.
- [ ] Tool ordering and schemas are deterministic.
- [ ] Generic tools remain backward compatible.
- [ ] `npm run typecheck` and `npm test` pass.

## STOP conditions

- A client requires protocol features absent from the current JSON-RPC implementation; document the required SDK/protocol change instead of partially implementing it.
- Tool discovery would require executing action code; stop and keep discovery metadata-only.
- A published action has no stable schema or scope; leave it unpublished.

## Maintenance notes

The registry is a cache boundary. If skills can change while the MCP process is running, add an explicit reload strategy and a tool-list-changed notification in a follow-up; do not silently return stale definitions.
