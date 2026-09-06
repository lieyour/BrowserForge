# Plan 005: Design and verify guarded write tools before implementing order creation

> **Executor instructions**: This is a design and characterization spike. It must not create an order or enable a write MCP tool.
>
> **Drift check**: `git diff --stat b8ba22e..HEAD -- src/compiler src/runtime extension src/mcp.ts tests README.md`.

## Status

- **Execution**: DONE on 2026-09-06; no write MCP or extension command was added
- **Priority**: P2
- **Effort**: M
- **Risk**: HIGH
- **Depends on**: plans/004-rdms-pilot-and-measurement.md
- **Category**: direction
- **Planned at**: commit `b8ba22e`, 2026-09-06

## Why this matters

The repository already has a separate form compiler/runtime in `src/compiler/` and `src/runtime/`, but the newer Chrome action path deliberately supports read-only actions. An operation such as `xxx_create_order` needs stronger guarantees than clicking a button: confirmation, idempotency, success evidence, duplicate-submit protection, and an audit record. This spike defines those guarantees from a safe fixture before any real write is exposed.

## Current state

- `src/contracts/skill.ts` models form actions with `risk: "write"` and success evidence.
- `src/runtime/skillRunner.ts` navigates a Playwright page, fills fields, submits, and returns typed errors, but it is a separate runtime from the Chrome bridge.
- `extension/background.js` filters exploration controls containing create/submit/payment terms, and `extension/content.js` currently has no write command contract.
- `src/mcp.ts` has no confirmation, idempotency key, or audit metadata in tool calls.

## Scope

**In scope**

- Design document under `docs/` or this plan's follow-up notes
- A local fixture and characterization tests for a fake order form
- Review of `src/contracts/skill.ts`, `src/runtime/skillRunner.ts`, and MCP error/confirmation shape

**Out of scope**

- Real RDMS or commerce navigation.
- Adding click/submit support to `extension/content.js`.
- Sending, creating, cancelling, or retrying an order.

## Steps

### Step 1: Specify the write contract

Define required fields: explicit user confirmation token, idempotency key, allowed origin and route, input schema, pre-submit review summary, success evidence selectors, timeout, and a no-retry default. Define result states for `NOT_CONFIRMED`, `VALIDATION_FAILED`, `SUBMIT_UNKNOWN`, `SUCCESS_CONFIRMED`, and `DUPLICATE_PREVENTED`.

**Verify**: a contract test rejects a call without confirmation or idempotency key and accepts only a local fixture plan.

### Step 2: Characterize failure behavior on a local fixture

Use a local page with success, validation-error, navigation-away, and submit-timeout states. Prove that a timeout is reported as unknown and cannot be automatically retried; prove that a second call with the same idempotency key is blocked.

**Verify**: `npm test -- tests/write-action-fixture.spec.ts` passes with no external network calls.

### Step 3: Decide the execution boundary

Compare extending the existing Playwright runtime with adding a separate Chrome write interpreter. Document the decision, required human confirmation UI, audit fields, and why the chosen boundary preserves the current logged-in-tab requirement. Do not implement until the contract and fixture tests are accepted.

**Verify**: design doc lists files, states, and a migration path; no production write command is present in `tools/list`.

## Done criteria

- [ ] Write contract and state machine are documented.
- [ ] Local fixture covers success, validation, unknown outcome, and duplicate prevention.
- [ ] No real-site mutation is possible after this plan.
- [ ] Decision identifies whether the Chrome bridge or existing Playwright runtime owns future writes.

## STOP conditions

- The business operation has no reliable success evidence or idempotency mechanism.
- The site requires a second factor or human approval not representable in the proposed contract.
- A test needs real credentials or a real order to prove behavior.

## Maintenance notes

Treat every write tool as a separately reviewed capability. A tool should remain unpublished until its fixture, audit trail, confirmation UX, and duplicate-submit behavior are verified.
