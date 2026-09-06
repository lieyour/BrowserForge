# Plan 006: Add demo MCP write tools that operate the current logged-in Chrome tab

> **Executor instructions**: Follow this plan step by step. This is explicitly a
> fast demo, not a production write platform. Keep the implementation finite and
> direct. Run the listed targeted checks; do not expand the design with audit,
> idempotency, RBAC, approval workflows, retries, or generic JavaScript execution.
> If a STOP condition occurs, stop and report instead of inventing a broader
> framework. When complete, change Plan 006 to `DONE` in `plans/README.md`.
>
> **Drift check (run first)**:
>
> ```powershell
> git diff --stat b8ba22e..HEAD -- README.md docs/guarded-write-tools.md extension/background.js extension/content.js extension/popup.html extension/popup.js fixtures/write-order.html src/actionRegistry.ts src/bridge.ts src/generator/responsesClient.ts src/generator/skillPackage.ts src/mcp.ts src/readAction.ts src/server.ts src/writeAction.ts tests/extension-bridge.spec.ts tests/mcp.spec.ts tests/responsesClient.spec.ts tests/server.spec.ts tests/skillPackage.spec.ts tests/write-action-fixture.spec.ts
> git status --short
> ```
>
> This plan was written against commit `b8ba22e` plus an already dirty working
> tree containing Plans 001-005 and their implementation. Do not reset or discard
> those changes. Compare the excerpts below with the live files before editing.

## Status

- **Priority**: P1
- **Effort**: L
- **Risk**: MED
- **Depends on**: `plans/003-expose-actions-as-mcp-tools.md`, `plans/005-guarded-write-tools-design-spike.md`
- **Category**: direction
- **Planned at**: commit `b8ba22e`, 2026-09-06, with uncommitted Plans 001-005 implementation present

## Why this matters

BrowserForge currently generates and publishes read-only MCP tools. The demo must
also prove that a generated named MCP tool can fill a form and perform one final
create/update/delete/submit action inside the user's already authenticated Chrome
tab. The shortest acceptable loop is:

```text
MCP tools/call -> local service -> extension bridge -> current tab
-> fill/select/check -> one window.confirm() -> one final click
-> success/failure/timeout result -> MCP structuredContent
```

This plan intentionally does not make that loop production-safe. It only keeps
the constraints needed for deterministic demo behavior: declarative JSON, exact
route matching, input validation, one confirmation, one final click, no retry,
and observable completion evidence.

## Current state

- `src/readAction.ts:26-30` defines only a read contract:

  ```ts
  export type ReadAction = {
    name: string; description?: string; mode: "read";
    scope: { origin: string; url: string; urlTemplate?: string };
    inputSchema: JsonSchema; outputSchema: JsonSchema; maxOutputChars: number;
    toolName?: string; risk: "read"; published: boolean;
    contractVersion: string; resultMetadata: boolean; plan: ReadActionPlan;
  };
  ```

- `src/actionRegistry.ts:15-21` locates references with
  `parseReadActionReference`, and `loadPublishedActionTools()` silently ignores
  every non-read reference.
- `src/bridge.ts:3` has one command type, `run-read-action`.
- `extension/background.js:31` always sends
  `BROWSERFORGE_RUN_READ_ACTION` to the active tab.
- `extension/content.js:135-180` has only `runReadAction()` and the matching
  message listener.
- `src/server.ts:128-144` loads a read action, validates it, resolves its route,
  and calls `bridge.run()`.
- `src/mcp.ts:11-21` advertises `browserforge_list_actions` and
  `browserforge_run_read_action`; named tools already route through
  `/api/actions/run` and hot-reload from `skills/`.
- `src/generator/responsesClient.ts:12-19` instructs the model that every action
  is read-only. `PageSnapshot` has no generation mode.
- `src/generator/skillPackage.ts:80-91,129-133` parses generated references only
  with `parseReadAction()`.
- `extension/popup.html:8-12` offers `single` and `flow`; there is no write-demo
  generation choice.
- The page snapshot already contains form evidence such as selectors, labels,
  names, input types, options, and buttons. Reuse it; do not add a second DOM
  crawler.
- `src/writeAction.ts` is only the Plan 005 fixture spike. It requires a
  confirmation token and idempotency key but is not connected to the bridge or
  MCP. Leave these spike exports in place unless removing them is required by a
  compile error; the demo path must not call them.
- `src/contracts/skill.ts`, `src/compiler/skillCompiler.ts`, and
  `src/runtime/skillRunner.ts` execute/import arbitrary generated JavaScript in a
  separate Playwright context. They are not the logged-in-tab write path and must
  not be reused.
- `tests/extension-bridge.spec.ts` is the structural example for a real unpacked
  MV3 extension plus local HTTP fixture. `tests/mcp.spec.ts` covers named tool
  discovery/calls and registry reload.
- Existing generated tools use `toolName` as a stable business name and
  `scope.urlTemplate` for route parameters. Keep those conventions.

## Target contract

Add this small write DSL to `src/writeAction.ts`; exact names may vary only when
needed to match existing naming:

```ts
export type WriteOperation = "create" | "update" | "delete" | "submit";
export type WriteField = {
  selector: string;
  kind: "fill" | "select" | "check";
};
export type WriteActionPlan = {
  version: 1;
  fields: Record<string, WriteField>; // key is an inputSchema property
  submitSelector: string;
  successSelector: string;
  failureSelector?: string;
  timeoutMs: number;                 // 100..10000
  confirmText: string;
};
export type WriteAction = {
  name: string;
  description?: string;
  mode: "write";
  operation: WriteOperation;
  scope: { origin: string; url: string; urlTemplate?: string };
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  maxOutputChars: number;
  toolName?: string;
  risk: "write";
  published: boolean;
  contractVersion: string;
  resultMetadata: boolean;
  plan: WriteActionPlan;
};
```

The runtime result should remain small and stable:

```ts
type WriteActionResult = {
  submitted: boolean;
  operation: WriteOperation;
  state: "SUCCESS" | "FAILURE" | "NOT_CONFIRMED" | "VALIDATION_FAILED" | "TIMEOUT";
  message?: string;
};
```

Do not add step arrays, arbitrary event scripts, navigation instructions,
multiple submit clicks, retry fields, tokens, audit records, or idempotency keys.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `npm run typecheck` | exit 0, no TypeScript errors |
| Contract tests | `npm test -- --workers=1 tests/write-action-fixture.spec.ts tests/skillPackage.spec.ts tests/responsesClient.spec.ts` | all selected tests pass |
| Runtime/MCP tests | `npm test -- --workers=1 tests/extension-bridge.spec.ts tests/server.spec.ts tests/mcp.spec.ts` | all selected tests pass |
| All targeted tests | `npm test -- --workers=1 tests/write-action-fixture.spec.ts tests/extension-bridge.spec.ts tests/server.spec.ts tests/mcp.spec.ts tests/skillPackage.spec.ts tests/responsesClient.spec.ts` | all selected tests pass |
| Forbidden execution check | `rg -n "new Function|\beval\(" extension src/writeAction.ts src/bridge.ts src/actionRegistry.ts` | no match in the new write path |

Do not run the entire Playwright suite unless a targeted failure suggests a wider
regression. Do not run any automated write against RDMS or another real site.

## Scope

**In scope** (the only files to modify):

- `src/writeAction.ts`
- `src/readAction.ts` — export small shared validators/types only if needed; do not redesign it
- `src/actionRegistry.ts`
- `src/bridge.ts`
- `src/server.ts`
- `src/mcp.ts`
- `src/generator/responsesClient.ts`
- `src/generator/skillPackage.ts`
- `extension/background.js`
- `extension/content.js`
- `extension/popup.html`
- `extension/popup.js`
- `fixtures/write-order.html`
- `tests/write-action-fixture.spec.ts`
- `tests/extension-bridge.spec.ts`
- `tests/server.spec.ts`
- `tests/mcp.spec.ts`
- `tests/responsesClient.spec.ts`
- `tests/skillPackage.spec.ts`
- `README.md`
- `docs/guarded-write-tools.md`
- `plans/README.md`

**Out of scope**:

- `src/contracts/skill.ts`, `src/compiler/skillCompiler.ts`, and
  `src/runtime/skillRunner.ts`.
- Production audit, persistence, RBAC, approval workflow, idempotency ledger,
  rollback, retries, multi-step navigation, API adapters, or queueing.
- Automatic writes to RDMS, production, test, staging, or any external website.
- A universal website guarantee. Generation may fail when the snapshot does not
  expose stable form selectors and completion evidence.
- Changing the existing read DSL or removing the generic read tool.
- Adding dependencies unless the current standard library and DOM APIs cannot
  implement a listed requirement.

## Git workflow

- Suggested branch: `advisor/006-demo-mcp-write-tools`.
- Preserve the dirty working tree; do not reset or revert Plans 001-005 changes.
- Prefer one commit after the targeted tests pass: `feat: add demo MCP write tools`.
- Do not push or deploy unless the operator separately asks.

## Steps

### Step 1: Add and validate the finite write-action contract

In `src/writeAction.ts`, keep the unused Plan 005 spike exports for compatibility
and add `WriteAction`, `WriteActionPlan`, `WriteActionResult`,
`parseWriteAction()`, and `parseWriteActionReference()`.

Validation rules:

- JSON object only; use the existing `codeBlock()` convention.
- Exact top-level and plan keys.
- `mode === "write"`, valid `operation`, `risk === "write"` when present.
- Reuse `JsonSchema` and `validateActionInput()` from `src/readAction.ts`.
- If schema/selector validation is private, export the existing functions or move
  only the minimum shared code. Do not create a validation framework.
- `scope.url` must parse and match `scope.origin`; validate `urlTemplate` using
  the same placeholder rules as reads.
- Every `plan.fields` key must exist in `inputSchema.properties`.
- `fill` and `select` fields accept string/number/integer schema properties;
  `check` accepts boolean.
- Selectors use the same 1..500-character restrictions as read selectors.
- `submitSelector`, `successSelector`, and optional `failureSelector` are required
  to be distinct valid selectors.
- `timeoutMs` is an integer from 100 through 10,000.
- `confirmText` is non-empty and at most 300 characters.
- Default `published`, `contractVersion`, and `resultMetadata` the same way as
  `parseReadAction()`.

Update `tests/write-action-fixture.spec.ts` to retain the Plan 005 characterization
tests and add parser cases for a valid write action, unknown keys, invalid field
mapping, bad selector, wrong schema type, and invalid timeout.

**Verify**:

```powershell
npm run typecheck
npm test -- --workers=1 tests/write-action-fixture.spec.ts
```

Expected: both commands exit 0; no network access is used.

### Step 2: Let package generation and the registry understand read or write references

In `src/actionRegistry.ts`, add a minimal discriminated union, for example
`type Action = ReadAction | WriteAction`, and a `parseActionReference()` helper
that reads the single JSON block, checks `mode`, and dispatches to the matching
parser. Replace read-only parsing in `locateReadAction()` and
`loadPublishedActionTools()` with union parsing. Rename `locateReadAction()` to
`locateAction()`; retain a compatibility wrapper only if an existing caller or
test still needs it.

Add `mode: "read" | "write"` to the internal `PublishedActionTool`. Do not expose
`domain`, `action`, or `mode` in MCP `tools/list`; they are routing metadata.
Make `resolveActionRoute()` accept and return the union while preserving the
existing RDMS special case and `urlTemplate` behavior.

In `src/generator/skillPackage.ts`, replace both direct `parseReadAction()` calls
with the union parser. `prepareGeneratedSkillPackage()` must continue assigning
`published`, `toolName`, and route parameters to either action mode. A package
must not bypass local validation just because the model labeled it `write`.

Tests:

- `tests/skillPackage.spec.ts`: a valid write reference is normalized, assigned a
  tool name, and accepted; malformed/mixed-mode output is rejected.
- `tests/mcp.spec.ts`: add a fixture write reference and assert that its named tool
  appears once with the declared input/output schemas.

**Verify**:

```powershell
npm run typecheck
npm test -- --workers=1 tests/skillPackage.spec.ts tests/mcp.spec.ts
```

Expected: commands exit 0; existing named read tools remain listed.

### Step 3: Add explicit write generation to the popup and model prompt

Add `generationMode?: "read" | "write"` to `PageSnapshot` in
`src/generator/responsesClient.ts`. Split the large system prompt into a shared
base plus a read or write instruction selected by `generationMode`; default to
`read` so existing callers/tests do not change behavior.

Write-mode prompt requirements:

- Return exactly one reference containing one `WriteAction` JSON object.
- Use only selectors and control metadata present in the supplied snapshot.
- Map visible input/select/checkbox controls to `plan.fields`.
- Choose one observed button/form control as `submitSelector`.
- Require an observed stable success selector; use a failure selector only when
  observed. Do not invent selectors.
- Generate a concrete operation (`create`, `update`, `delete`, or `submit`) and a
  business tool name; do not generate read actions in the same request.
- State that execution is one final click with no retry and no arbitrary JS.

In `extension/popup.html`, keep the existing options and add:

```html
<option value="write">Current page — write demo</option>
```

In `extension/popup.js`, send `generationMode: "write"` for that option and
`generationMode: "read"` for the current single-page read option. The flow mode
stays read-only. In `src/server.ts`, pass this field through `/api/generate` after
checking it is either `read` or `write`.

Tests:

- `tests/responsesClient.spec.ts`: mocked write-mode response uses the write
  prompt and validates; default/read mode retains the current prompt behavior.
- `tests/skillPackage.spec.ts`: write generation cannot smuggle a JavaScript
  block or an invalid selector.

**Verify**:

```powershell
npm run typecheck
npm test -- --workers=1 tests/responsesClient.spec.ts tests/skillPackage.spec.ts tests/server.spec.ts
```

Expected: selected tests pass and read generation remains the default.

### Step 4: Execute one write action in the current logged-in tab

In `src/bridge.ts`, change `BridgeCommand` to a read/write discriminated union.
`BrowserBridge.run(action, input)` must emit `run-read-action` for reads and
`run-write-action` for writes while keeping the same task/result transport.

In `extension/background.js`, map the command type to either
`BROWSERFORGE_RUN_READ_ACTION` or `BROWSERFORGE_RUN_WRITE_ACTION`. Unknown command
types must return an error without sending a tab message.

In `extension/content.js`, add a separate `runWriteAction(command)`; do not merge
it into `runReadAction()` and do not use `eval`, `new Function`, injected script
text, or Playwright. The function must:

1. Confirm the current URL matches the already resolved exact action scope.
2. Validate the input using the same finite checks already used for reads, or a
   small local equivalent if the content script cannot import modules.
3. Resolve every declared field selector before mutating anything. Missing or
   ambiguous selectors return `VALIDATION_FAILED`.
4. Apply fields in object order:
   - `fill`: assign `String(value)` through the native input/textarea value setter,
     then dispatch bubbling `input` and `change` events.
   - `select`: select an option by exact value first, then exact visible text;
     dispatch bubbling `change`.
   - `check`: require a boolean, set `checked`, then dispatch bubbling `input` and
     `change`.
5. Call `window.confirm(plan.confirmText)` exactly once. If dismissed, return
   `{submitted:false,state:"NOT_CONFIRMED"}` and do not click.
6. Resolve and click `submitSelector` exactly once.
7. Poll for `successSelector` or `failureSelector` until `timeoutMs`. Success wins
   only when its element exists and is visibly rendered. Return `SUCCESS`,
   `FAILURE`, or `TIMEOUT`; never click or submit again.

Add the `BROWSERFORGE_RUN_WRITE_ACTION` listener beside the existing read
listener and preserve the bridge response shape `{ok,data,durationMs}`.

Extend `fixtures/write-order.html` so local JavaScript records submit count and
can deterministically show success, failure, or neither. Include text input,
select, checkbox, one submit button, and stable `data-testid` selectors. Do not
send HTTP mutations.

Extend `tests/extension-bridge.spec.ts` using its existing unpacked-extension
setup. Cover:

- fill + select + check, accept native dialog, exactly one submit, success result;
- dismiss native dialog, zero submits, `NOT_CONFIRMED`;
- visible failure evidence returns `FAILURE` without retry;
- no evidence returns `TIMEOUT` without retry;
- missing selector returns `VALIDATION_FAILED` before any field changes;
- read execution still works.

Use Playwright's dialog event to accept or dismiss the real `window.confirm()`;
do not stub the content-script implementation.

**Verify**:

```powershell
npm run typecheck
npm test -- --workers=1 tests/extension-bridge.spec.ts
rg -n "BROWSERFORGE_RUN_WRITE_ACTION|run-write-action" extension src/bridge.ts
```

Expected: tests pass, the search shows the bridge/background/content wiring, and
each tested invocation clicks at most once.

### Step 5: Route write tools through the service and MCP

In `src/server.ts`, use `locateAction()` and the union route resolver for both
`GET /api/actions` and `POST /api/actions/run`. Extend the request shape with an
optional expected `mode`. Reject a call when the caller expects `write` but the
reference is read, or vice versa. Set invocation tool fallback to
`browserforge_run_write_action` for writes and preserve the current read fallback.

In `src/mcp.ts`:

- Add generic `browserforge_run_write_action` with the same domain/action/input
  request shape as the read generic tool.
- Include `mode` in internal named-tool routing and send it to
  `/api/actions/run`.
- Generic read/write tools must send their expected mode.
- Strip `mode`, `domain`, and `action` from advertised named tool definitions.
- Keep `tools/list_changed` and reload-on-list behavior unchanged.

Tests:

- `tests/server.spec.ts`: list a write action as runnable; route a write command;
  reject mode mismatch; preserve the current disconnected-bridge 503 behavior.
- `tests/mcp.spec.ts`: generic write call routes with `mode:"write"`; named write
  tool routes with its name/mode/input; service errors remain MCP `isError` tool
  results; read tools remain unchanged.

**Verify**:

```powershell
npm run typecheck
npm test -- --workers=1 tests/server.spec.ts tests/mcp.spec.ts
```

Expected: all selected tests pass; a named write tool is visible in `tools/list`
and reaches a `run-write-action` bridge command.

### Step 6: Document the demo boundary and run the targeted regression set

Update `README.md` with a short “Demo write tools” section containing:

- Generate using `Current page — write demo`.
- The generated, validated action appears as a named MCP tool after registry
  reload.
- Calling it acts in the current logged-in Chrome tab, asks for one confirmation,
  clicks once, and reports success/failure/timeout.
- It supports create/update/delete/submit only when the current page exposes
  stable selectors and completion evidence.
- It is demo-only: no audit, idempotency, RBAC, retry, rollback, or multi-page
  workflow.

Update `docs/guarded-write-tools.md` without deleting Plan 005's production
analysis. Add a section saying Plan 006 implements a deliberately lighter demo
mode and list the omitted production controls. State that production enablement
requires a separate follow-up plan.

Then run only the targeted suite:

```powershell
npm run typecheck
npm test -- --workers=1 tests/write-action-fixture.spec.ts tests/extension-bridge.spec.ts tests/server.spec.ts tests/mcp.spec.ts tests/skillPackage.spec.ts tests/responsesClient.spec.ts
rg -n "new Function|\beval\(" extension src/writeAction.ts src/bridge.ts src/actionRegistry.ts
git status --short
```

Expected:

- typecheck exits 0;
- all selected tests pass;
- forbidden execution search has no match in the new write path (an unrelated
  legacy match outside the searched paths does not block this demo);
- `git status` contains only pre-existing changes plus files listed in Scope.

Finally change Plan 006's status in `plans/README.md` from `TODO` to `DONE`.

## Test plan

The minimum automated coverage is:

- Contract: valid create/update/delete/submit operation; invalid keys, selectors,
  field/schema mapping, and timeout.
- Generation: read remains default; write mode accepts one write reference and
  rejects arbitrary code or invented structure.
- Browser runtime: fill/select/check, accept, dismiss, success, failure, timeout,
  missing selector, exactly one click, no retry.
- Server: list/run write action, expected-mode mismatch, bridge disconnected.
- MCP: generic write tool, named write tool, schemas, routing metadata stripped,
  errors returned as MCP tool errors, read regression.

All write runtime tests must use `fixtures/write-order.html`. Automated tests must
not open or mutate RDMS or another external site.

## Done criteria

- [ ] `npm run typecheck` exits 0.
- [ ] The six-file targeted Playwright command in Step 6 passes.
- [ ] Popup exposes `Current page — write demo`; read and flow behavior still work.
- [ ] A generated validated write reference appears as a named MCP tool.
- [ ] Calling that tool reaches the active authenticated tab through
      `run-write-action` / `BROWSERFORGE_RUN_WRITE_ACTION`.
- [ ] The local fixture proves fill/select/check, one confirm, one click,
      success/failure/timeout/cancel, and no retry.
- [ ] No arbitrary JavaScript execution exists in the new write path.
- [ ] README and guarded-write documentation describe the demo and its omissions.
- [ ] No automated external-site mutation was performed.
- [ ] No file outside Scope was newly modified.
- [ ] `plans/README.md` marks Plan 006 `DONE`.

## STOP conditions

Stop and report; do not broaden the implementation if:

- The current files no longer match the read-action/MCP/bridge architecture in
  Current state, or implementing this would overwrite later user changes.
- The only way to support a target action is model-generated JavaScript,
  `eval`, `new Function`, or an unrestricted step runner.
- A workflow requires navigation or more than one terminal click/submit.
- The page snapshot has no stable submit selector or no stable completion
  evidence. Generation should fail validation; runtime may return `TIMEOUT`.
- A test would need to mutate RDMS or another real environment.
- A targeted verification fails twice after a reasonable local fix.
- Completion requires audit, idempotency, RBAC, queues, retries, rollback, or a
  new dependency. Those belong in a separate production plan.

## Maintenance notes

- This demo does not claim that every website is supported. Standard HTML and
  framework-controlled inputs should work; canvas controls, closed shadow DOM,
  cross-origin iframes, CAPTCHAs, and multi-page wizards are deferred.
- Keep the read and write content-script interpreters separate so write behavior
  cannot accidentally expand the read action surface.
- Generated write references remain ordinary files under `skills/<domain>/` and
  can be reviewed or deleted like read references.
- If this moves beyond a demo, create Plan 007 for persistent audit,
  idempotency/deduplication, permissions, stronger confirmation, recovery, and
  real-environment acceptance testing. Do not grow Plan 006 into that project.
