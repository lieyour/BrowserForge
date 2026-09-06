# Handoff: Plans 003–005

Implemented and authenticated-page validated on 2026-09-06.

## Delivered

- Added a deterministic registry for validated, explicitly published read actions. MCP advertises sorted named tools with input/output schemas and rejects cross-skill name collisions at startup.
- Kept the generic list/run tools and routed named calls through the same `/api/actions/run` endpoint and Chrome bridge.
- Added structured MCP result-level errors and invocation visibility containing only tool/action routing and duration.
- Parameterized `rdms_list_deployment_instances` with `appCode`, `sysCode`, `env`, and `appName`; route construction uses `URLSearchParams`, exact current-tab matching, bounded readiness polling, deduplication, an output envelope, and explicit empty/output-limit errors.
- Recorded local mock measurements plus 10 authenticated generic runs and 10 authenticated named runs in `docs/rdms-pilot-measurements.md`.
- Added the guarded-write design, localhost-only contract validator, fake order fixture, state characterization, and duplicate prevention. No write MCP tool or extension command was added.
- Updated README and plan statuses.

## Follow-up: generated Skill to live MCP

- Validated generated read actions are now published automatically with deterministic namespaced tool names.
- Query/hash route parameters are represented by validated `scope.urlTemplate` placeholders and MCP input fields; execution still requires an exact current-tab match and never navigates.
- MCP reloads the published registry for each list/call and emits `notifications/tools/list_changed` when `skills/` changes.
- The real-generation evaluator now requires discovery through `tools/list` and execution through `tools/call`; direct action execution no longer counts as MCP validation.

## Verification

- `npm run typecheck` — passed.
- `npm test` — passed, 30 tests.
- `npm test -- tests/readAction.spec.ts tests/mcp.spec.ts tests/rdms.spec.ts tests/write-action-fixture.spec.ts` — passed, 10 tests after schema hardening.
- Piped `tools/list` into `npm run --silent mcp` — stdout contained one JSON-RPC response with the two generic tools and `rdms_list_deployment_instances` with complete schemas.
- `rg -n "BROWSERFORGE_RUN_WRITE|run-write-action|create[_-]order" extension src/mcp.ts` — no matches.
- `rg -n "new Function|\beval\s*\(" extension src/bridge.ts src/readAction.ts src/actionRegistry.ts` — no matches.
- `git diff --check` — passed; only existing line-ending conversion warnings were printed.

## Authenticated validation

- The initial synthetic selector failed with `ROOT_NOT_FOUND`. Limited DOM evidence showed the actual `x-table` structure, so the RDMS-only root and collection selectors were corrected without broadening the generic DSL.
- The corrected tool returned one bounded structured instance from the exact authenticated test route.
- Ten generic and ten named authenticated runs each succeeded 10/10 with no manual intervention or model calls.
- Future RDMS UI changes still require redacted selector evidence before modifying the contract.

## Workspace note

The worktree was already dirty with Plans 001/002 and unrelated changes. They were preserved; no reset, checkout, commit, deployment, credentials, production database, or real-site write operation was performed.
