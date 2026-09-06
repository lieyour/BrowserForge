# Plan 002: Run browser actions through a declarative extension executor

> **Executor instructions**: Replace the arbitrary source execution boundary while preserving current-tab login state and the generic compatibility API. Do not enable writes.
>
> **Drift check**: `git diff --stat b8ba22e..HEAD -- extension/content.js extension/background.js extension/manifest.json src/bridge.ts src/readAction.ts tests/`.

## Status

- **Completion**: DONE (2026-09-06)
- **Priority**: P0
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: plans/001-typed-action-contract.md
- **Category**: security
- **Planned at**: commit `b8ba22e`, 2026-09-06

## Why this matters

`extension/content.js:84-92` reconstructs action source with `new Function`. The generated text is model output and the extension is a privileged delivery path into a logged-in tab. Chrome content scripts run in an isolated world and extension CSP is designed to restrict string-based code execution. A finite declarative executor also makes MCP tools reviewable and reproducible.

## Current state

- `extension/background.js:27-45` polls the local service and sends a `run-read-action` command to the active HTTP(S) tab.
- `src/bridge.ts:3` transports `source` plus action metadata to the extension.
- `extension/content.js:84-96` checks the exact URL, evaluates `command.source`, calls `execute`, and validates only top-level output shape.
- `src/readAction.ts:19-22` rejects several dangerous tokens, but token filtering is not a capability boundary.
- Current tests execute action source directly with `new Function` in `tests/readAction.spec.ts:17`; this tests the old model, not the extension runtime.

## Scope

**In scope**

- `src/readAction.ts`, `src/bridge.ts`
- `extension/content.js`, `extension/background.js`, `extension/manifest.json`
- `src/generator/responsesClient.ts`, generated RDMS reference format
- New focused tests under `tests/` and a local extension/browser fixture if needed.

**Out of scope**

- Any click, submit, navigation, fetch, storage, cookie, or direct API operation.
- Publishing business tools; Plan 003.

## Steps

### Step 1: Define a finite read operation DSL

Add a serializable action plan containing scope URL, root selector, wait condition, table/list selectors, field selectors, deduplication key, and output field mapping. Support only DOM reads through a root element. Do not accept function bodies or selector expressions from an untrusted execution context. Validate selectors, output keys, limits, and allowed URL origin on the server.

**Verify**: unit tests accept the RDMS table plan and reject function source, global `document.body`/table selectors, storage/cookie access, unknown operations, and cross-origin scope.

### Step 2: Implement the content-script interpreter

In `extension/content.js`, interpret the validated plan using ordinary DOM APIs already present in the content script. Preserve exact URL matching, output-size limits, and input validation. Return structured errors with a stable code (`SCOPE_MISMATCH`, `ROOT_NOT_FOUND`, `DATA_NOT_READY`, `OUTPUT_TOO_LARGE`, `INVALID_PLAN`). Remove the `new Function` path after compatibility tests pass.

**Verify**: `npm test -- tests/readAction.spec.ts tests/declarativeAction.spec.ts` -> fixture tables return the expected rows and all listed error codes are asserted.

### Step 3: Update bridge transport and generated references

Change `BridgeCommand` to carry the declarative plan rather than `source`. Update generation instructions and `skills/rdms.dmall.com/references/list-deployment-instances.md` to the new plan format. Keep a clear migration error for an old reference instead of silently executing arbitrary source.

**Verify**: `rg -n "new Function|source:" extension src/bridge.ts` -> no runtime execution path remains; only tests or parser migration code may mention the old format, and those mentions must be documented.

### Step 4: Test the actual extension path

Add a Playwright extension test using a temporary Chromium persistent context and the unpacked `extension/` directory. Serve a local HTTP fixture with a table and assert that the bridge command returns structured rows without navigating away. Test a page with no root and a wrong hash URL. Follow Playwright's extension testing pattern with a persistent context.

**Verify**: `npm test -- tests/extension-bridge.spec.ts` -> the extension service worker, content script, and bridge complete the fixture command.

## Test plan

Keep parser tests separate from browser integration tests. The integration fixture must prove the command goes through `background.js` and `content.js`; invoking the interpreter directly is insufficient.

## Done criteria

- [x] `npm run typecheck` exits 0.
- [x] `npm test` passes, including the actual extension bridge test.
- [x] No production extension path evaluates action strings with `eval` or `new Function`.
- [x] Read actions cannot click, submit, navigate, fetch, read storage/cookies, or mutate the DOM.
- [x] Existing generic read actions either migrate to the DSL or fail with an explicit migration error.

## STOP conditions

- A target site requires page JavaScript globals or network interception to read the data; keep it out of this DSL and report it.
- Chromium cannot load the unpacked extension in the repository's test environment; do not weaken CSP or reintroduce arbitrary evaluation to make the test pass.
- The fixture shows that the current hash URL is not stable enough for exact scope matching; propose a documented route matcher before changing it.

## Maintenance notes

Every new DSL operation needs a parser test, an interpreter test, and an explicit capability review. Treat additions as security-sensitive because commands run in logged-in tabs.
