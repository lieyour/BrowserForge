# Plan 001: Establish a typed action contract and a clean verification baseline

> **Executor instructions**: Follow the steps in order. Preserve all existing user changes. If a STOP condition occurs, stop and report it.
>
> **Drift check**: `git diff --stat b8ba22e..HEAD -- src/readAction.ts src/generator/skillPackage.ts src/generator/responsesClient.ts tests/readAction.spec.ts tests/skillPackage.spec.ts`.

## Status

- **Completion**: DONE (2026-09-06, delivered together with Plan 002)
- **Priority**: P0
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: tech-debt
- **Planned at**: commit `b8ba22e`, 2026-09-06

## Why this matters

The current action format mixes a useful business contract with arbitrary JavaScript source. `src/readAction.ts` validates that source by evaluating it and currently fails the repository typecheck because the parsed partial action does not narrow `maxOutputChars`. Later MCP registration also needs stable risk, publication, version, and capability metadata. This plan makes the contract explicit and gives the next plans a reliable baseline.

## Current state

- `src/readAction.ts:9-18` defines `ReadAction` with `mode: "read"`, scope, schemas, output limit, and an executable function.
- `src/readAction.ts:42-54` evaluates the source and validates the partial action; `npm run typecheck` currently reports `action.maxOutputChars` may be undefined at lines 53-54.
- `src/generator/skillPackage.ts:6` stores only `skill` and `references`; `src/generator/responsesClient.ts:12` instructs the model to emit arbitrary read-only action JavaScript.
- `src/server.ts:99-145` discovers and runs references from Markdown, while `src/mcp.ts:7-36` exposes only generic list/run tools.
- Existing tests are Playwright tests in `tests/`; the commands are `npm run typecheck` and `npm test`.

## Scope

**In scope**

- `src/readAction.ts`
- `src/generator/responsesClient.ts`
- `src/generator/skillPackage.ts`
- `tests/readAction.spec.ts`
- `tests/skillPackage.spec.ts`
- Add a focused contract test file under `tests/` if needed.

**Out of scope**

- `extension/` execution behavior; that is Plan 002.
- MCP tool registration; that is Plan 003.
- Write actions, cookies, storage, direct HTTP APIs, or authentication.

## Steps

### Step 1: Make parsed actions type-safe

In `src/readAction.ts`, validate a local fully narrowed object before returning `ReadAction`; do not silence the compiler with a non-null assertion. Preserve the existing limits and error messages where possible. Add tests for missing/invalid `maxOutputChars`, scope mismatch, and output-size rejection.

**Verify**: `npm run typecheck` -> exit 0.

### Step 2: Add publication metadata without breaking old references

Extend the action contract with optional metadata needed for MCP publication: stable tool name, risk (`read` for this plan), human description, `published` defaulting to false, and a contract version. Treat missing metadata in existing generated references as unpublished legacy read actions. Update the generation instructions and package validation so generated references can include the metadata but old `skills/` files remain loadable.

**Verify**: `npm test -- tests/readAction.spec.ts tests/skillPackage.spec.ts` -> all existing and new tests pass.

### Step 3: Define the compatibility rule

Document in code comments/tests that a reference remains runnable through `browserforge_run_read_action` even when it is not published as a named MCP tool. Reject duplicate published tool names within one domain and reject names outside a namespaced pattern such as `<domain>_<action>`.

**Verify**: `npm test -- tests/readAction.spec.ts tests/skillPackage.spec.ts` -> duplicate and invalid-name cases fail with the expected validation errors.

## Test plan

Follow the style of `tests/readAction.spec.ts` and `tests/server.spec.ts`. Cover legacy references, valid metadata, invalid risk/version/name, duplicate published names, and the existing RDMS reference.

## Done criteria

- [x] `npm run typecheck` exits 0.
- [x] `npm test -- tests/readAction.spec.ts tests/skillPackage.spec.ts` passes.
- [x] Existing Skill packages remain loadable; legacy JavaScript references are reported as non-runnable with an explicit migration error after Plan 002 removes source execution.
- [x] Publication metadata is defined without adding named MCP registration; that remains Plan 003.

## STOP conditions

- The current reference format differs from the excerpts above.
- A metadata change requires rewriting all generated Markdown rather than supporting legacy defaults.
- Validation requires executing an action during package loading.

## Maintenance notes

Keep metadata validation deterministic and side-effect free. The publication flag is a product decision, not proof that the action is correct; Plan 004 must still verify the RDMS action against a real page.
