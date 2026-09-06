# Guarded write tool spike

Plan 005 does not publish or execute a real-site write tool. The executable characterization boundary is `fixtureOnly: true` plus an HTTP origin whose host is `127.0.0.1` or `localhost`.

## Contract

A future write action must declare:

- exact allowed origin and route;
- JSON input schema and fields shown in a pre-submit review;
- an explicit confirmation token supplied by the user for that call;
- an 8–128 character idempotency key;
- validation and success evidence selectors;
- a bounded timeout;
- `retry: "never"` by default.

The audit record must contain tool/action name, origin and route, contract version, idempotency key, confirmation time, review-field names, outcome, duration, and evidence selector matched. It must not contain cookies, tokens, page text, or hidden form fields.

## Result states

```text
call
  -> bad/missing confirmation       -> NOT_CONFIRMED
  -> invalid input/idempotency key  -> VALIDATION_FAILED
  -> previously reserved key        -> DUPLICATE_PREVENTED
  -> submit + validation evidence   -> VALIDATION_FAILED
  -> submit + success evidence      -> SUCCESS_CONFIRMED
  -> timeout/navigation/no evidence -> SUBMIT_UNKNOWN
```

`SUBMIT_UNKNOWN` keeps the idempotency key reserved and must never trigger an automatic retry. A human must inspect the target system before choosing a new key.

## Execution boundary decision

Future logged-in-tab writes should use a separate Chrome write interpreter, not the existing Playwright runtime. Playwright opens a separate browser context and therefore does not preserve the user's current authenticated Chrome tab. The read interpreter must remain read-only; the write interpreter needs a separate message type, per-tool allowlist, confirmation UI in the extension, idempotency/audit storage, and success-evidence handling.

Migration path:

1. Review one business operation's fixture, success evidence, and idempotency semantics.
2. Add extension confirmation UI that displays the exact review summary and route.
3. Add a separate guarded write command; do not add click/submit operations to the read DSL.
4. Persist the audit record before submit and finalize it after evidence evaluation.
5. Publish the MCP tool only after duplicate, timeout, navigation-away, and manual-recovery tests pass.

At the end of Plan 005, `tools/list` contained no write tool and `extension/content.js` contained no click/submit write command. Plan 006 changes that demo boundary only as described below.

## Plan 006 demo mode

Plan 006 implements a deliberately smaller logged-in-tab demo path alongside the Plan 005 production analysis. A generated write reference is strict JSON, matches one exact route, maps input properties to finite `fill`/`select`/`check` operations, asks for one native confirmation, performs one final click, and polls declared success/failure evidence until a bounded timeout. The browser bridge and content script use separate write command types; the read interpreter remains read-only.

The demo omits the production controls described above: persistent audit, confirmation tokens, idempotency keys or ledgers, RBAC, approval workflows, retries, rollback, queues, recovery coordination, multi-step navigation, and real-environment acceptance automation. It must not be treated as production enablement.

Moving beyond this demo requires a separate follow-up plan. Do not extend Plan 006 in place with those controls.
