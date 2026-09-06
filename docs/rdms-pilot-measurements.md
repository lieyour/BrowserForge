# RDMS deployment-instance pilot measurements

## Local protocol comparison

Measured on 2026-09-06 with the real MCP handler and registry, a local mock service, the same RDMS input, and 10 sequential successful runs per path. The generic path called `browserforge_list_actions` and then `browserforge_run_read_action`; the named path called `rdms_list_deployment_instances` directly. No model API, browser extension, RDMS network, credentials, or page data was used.

| Path | Sample | Structured successes | MCP tool calls/run | Request bytes/run | Response bytes/run | Approx. request/output tokens | Mean local wall time |
|---|---:|---:|---:|---:|---:|---:|---:|
| Generic discovery + run | 10 | 10 | 2 | 402 | 634 | 101 / 159 | 4.676 ms |
| Named tool | 10 | 10 | 1 | 199 | 322 | 50 / 81 | 0.239 ms |

Token estimates use `ceil(UTF-8 JSON bytes / 4)` and are protocol-payload estimates, not provider tokenizer counts. Local timing mostly measures mock/fetch overhead; it does not predict RDMS page latency. The measured result supports only the claim that the named path removes one tool call and roughly halves this fixture's MCP JSON payload. It does not prove real-site reliability or end-to-end token savings.

Command shape used for the measurement:

```text
generic: tools/call browserforge_list_actions -> tools/call browserforge_run_read_action
named:   tools/call rdms_list_deployment_instances
```

## Authenticated-tab measurement

Executed on 2026-09-06 against the user-approved test route. The first call returned `ROOT_NOT_FOUND`; limited structural inspection found the real instance table under `div.x-module.x-box-line.x-box-root` with main content table `.x-table-wrapper.main table.x-content-table`. No instance rows, cookies, tokens, screenshots, or credentials were persisted while collecting selector evidence.

After correcting the RDMS-only selector, the smoke test returned one bounded structured instance. One redacted measurement was: 457 output bytes, 899 ms total, 1 ms content-script execution, 895 ms bridge wait, zero model calls, and zero manual intervention after login.

The same authenticated task was then executed 10 times through each MCP path:

| Path | Sample | Successes | Tool calls/run | Request bytes/run | Response bytes/run | Approx. request/output tokens | Mean wall time | Mean action time | Mean bridge wait | Model calls | Manual interventions |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Generic discovery + run | 10 | 10 | 2 | 402 | 5255 | 101 / 1314 | 1003.2 ms | 0.3 ms | 974.1 ms | 0 | 0 |
| Named tool | 10 | 10 | 1 | 199 | 1472 | 50 / 368 | 1022.0 ms | 0.6 ms | 1013.2 ms | 0 | 0 |

The named path removed one tool call and reduced measured protocol payload. Wall time was effectively unchanged because the extension's one-second idle polling interval dominates this small read. Agent turns were not measured because the comparison used the MCP handler directly without a model agent.

If the RDMS structure changes, capture redacted selector evidence and stop instead of broadening selectors globally.
