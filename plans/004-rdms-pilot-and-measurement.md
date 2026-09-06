# Plan 004: Ship the parameterized RDMS deployment-instance tool and measure its benefit

> **Executor instructions**: Use RDMS as the first concrete business-tool pilot. Do not use production credentials or submit any write operation.
>
> **Drift check**: `git diff --stat b8ba22e..HEAD -- skills/rdms.dmall.com src extension tests README.md`.

## Status

- **Execution**: DONE on 2026-09-06; authenticated smoke test and 10-run generic/named comparison passed
- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: plans/003-dynamic-mcp-tools.md
- **Category**: direction
- **Planned at**: commit `b8ba22e`, 2026-09-06

## Why this matters

The current RDMS reference hard-codes one complete hash URL and has an empty input schema. That proves DOM extraction but does not yet provide a reusable `rdms_list_deployment_instances` operation. The pilot should accept only parameters that can be mapped to a known RDMS route, wait for the deployment module, return a bounded JSON result, and provide before/after measurements against the generic Skill workflow.

## Current state

- `skills/rdms.dmall.com/references/list-deployment-instances.md:9-19` requires the active tab to be at one exact URL and reads `[data-browserforge-module="deployment-instances"]`.
- `tests/readAction.spec.ts:9-25` tests a synthetic module and duplicate row removal; it does not load the extension or the real RDMS page.
- `src/generator/responsesClient.ts:12` tells the model to use snapshot selectors, but there is no site-specific parameter schema or readiness contract.

## Scope

**In scope**

- `skills/rdms.dmall.com/SKILL.md` and the deployment reference
- RDMS registry metadata and route builder in the action/registry layer from Plan 003
- `extension/content.js` readiness polling for the declared module root
- `tests/rdms.spec.ts`, `tests/mcp.spec.ts`, and measurement notes in `README.md` or `docs/`

**Out of scope**

- Creating, updating, deleting, deploying, or purchasing anything in RDMS.
- Hard-coding credentials, cookies, tokens, or environment-specific secrets.
- Assuming arbitrary RDMS applications share the same DOM without evidence.

## Steps

### Step 1: Parameterize only verified route fields

Define the smallest input schema supported by observed RDMS URLs, likely `appCode`, `sysCode`, `env`, and `appName` with explicit enum or string limits where known. Build the hash route with `URL`/`URLSearchParams`-style structured handling, and keep the current tab as the execution target. Decide and document whether the tool requires the tab to already be on the exact route or may navigate; the safer first pilot is exact-route only, with a clear `SCOPE_MISMATCH` error.

**Verify**: unit tests cover encoding of Chinese app names, environment mismatch, unknown fields, and exact route matching.

### Step 2: Add readiness and bounded extraction

Make the declarative plan wait for the module root/table to appear for a bounded interval, then extract only the documented instance fields and deduplicate by `instanceName`. Return a result envelope containing the tool version, route, count, and `instances`; enforce the maximum output size.

**Verify**: fixture tests cover delayed module insertion, missing module, duplicate names, empty table, and output-size rejection.

### Step 3: Publish the named tool

Mark only this validated reference as published and expose it as `rdms_list_deployment_instances` through the Plan 003 registry. Keep the generic action available for debugging. The tool description must state that the active tab must already be logged in and at the exact RDMS deployment route.

**Verify**: MCP test calls the named tool with valid parameters and receives the same structured instance data as the generic route; invalid parameters never reach the extension.

### Step 4: Run a real authenticated-tab smoke test manually

With a user-provided logged-in tab, run the tool against a non-destructive test environment. Record action duration, bridge wait time, output bytes, model calls, and success/failure reason. Never persist page text or credentials. If the page does not contain the expected module marker, capture the selector evidence and stop the pilot rather than weakening selectors globally.

**Verify**: attach a redacted measurement record to the documentation; no secret or page-wide dump is committed.

### Step 5: Compare against the existing Skill flow

Use the same task set to compare: generic Skill selection plus action call versus named MCP call. Measure total agent turns, input/output token estimates, wall time, successful structured results, and manual interventions over at least 10 repeated runs where feasible.

**Verify**: documentation contains a table with the sample size and raw measurement method; do not claim an improvement without measured data.

## Done criteria

- [ ] `rdms_list_deployment_instances` is listed with a complete input/output schema.
- [ ] It returns bounded, deduplicated instance data on the authenticated test page.
- [ ] Wrong route, missing module, timeout, and empty data have distinct safe errors.
- [ ] No write capability or credential persistence is introduced.
- [ ] `npm run typecheck` and `npm test` pass.
- [ ] Before/after measurements are documented with sample size.

## STOP conditions

- The real page uses a different module root or server-rendered data path than the fixture; stop and update the action evidence first.
- The route requires navigation to reach the data and the user has not explicitly approved navigation; keep exact-route behavior.
- The result includes tokens, cookies, unrelated page text, or more than the declared output budget.

## Maintenance notes

RDMS UI changes should invalidate the published tool or bump its contract version. Keep a fixture that reflects the smallest stable DOM contract and a manual smoke test for the real application.
