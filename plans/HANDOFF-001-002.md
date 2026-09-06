# Handoff: Plans 001 and 002

Completed on 2026-09-06. Stop point: do not start Plan 003 in this handoff.

## Delivered

- Replaced executable JavaScript read references with a strict JSON action contract and finite DOM-read plan.
- Added metadata for `toolName`, `risk`, `published`, `description`, and `contractVersion`; missing publication metadata defaults to unpublished read actions.
- Added deterministic validation for action scope, schemas, output limit, scoped root selectors, selectors, field/output mappings, deduplication keys, unknown DSL fields, duplicate published tool names, and namespaced tool names.
- Changed the server/bridge transport to send the validated plan instead of source code.
- Replaced the content-script `new Function` path with a read-only interpreter. Stable errors: `SCOPE_MISMATCH`, `ROOT_NOT_FOUND`, `DATA_NOT_READY`, `OUTPUT_TOO_LARGE`, `INVALID_PLAN`.
- Migrated `rdms.dmall.com/list-deployment-instances` to the JSON DSL and marked it published as `rdms_list_deployment_instances` for the later Plan 003 registry work.
- Legacy JavaScript references remain visible in action listings but are non-runnable and return an explicit migration error.
- Added an actual unpacked-extension Chromium test covering the local service, MV3 service worker, background bridge, content script, deduplication, and all interpreter error codes.
- Updated README security/runtime behavior and marked Plans 001/002 complete.

## Verification

- `npm run typecheck` — passed.
- `npm test` — passed, 22 tests.
- `rg -n "new Function|\beval\s*\(" extension src/bridge.ts src/readAction.ts` — no matches.
- `rg -n "source:" extension src/bridge.ts` — no matches.
- `git diff --check` — passed; only existing line-ending conversion warnings were printed.

## Remaining risks / next work

- Only `list-deployment-instances` has been migrated. Other generated GitHub/RDMS JavaScript references intentionally report the migration error until regenerated or converted.
- The extension now requests HTTP(S) host access because MV3 background bridge injection is not covered reliably by `activeTab` without a user gesture. Exact URL scope and the finite read DSL remain enforced at runtime.
- The DSL currently models repeated row/list extraction. Add new operations only with parser, interpreter, integration tests, and a capability review.
- Plan 003 may consume `published` and `toolName`; it must not publish legacy/non-runnable references.

## Workspace note

The worktree was already dirty before execution. Existing unrelated changes were preserved; no reset, checkout, commit, deployment, or production operation was performed.
