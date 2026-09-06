# List Deployment Instances

## Action: list-deployment-instances

## Requirements

- Keep the current logged-in Chrome tab at the exact RDMS deployment URL built from the input below.
- This is a read-only action. It never navigates, clicks, submits, fetches, or changes browser state.

## How to run this action

Pass `appCode`, `sysCode`, `env`, and `appName`. BrowserForge encodes these fields into the known RDMS hash route, requires the current tab to match it exactly, then reads only the deployment-instance module and deduplicates repeated instance rows by name.

## Navigate to

`https://rdms.dmall.com/#index/environment/dmallenv/appdetail:versionType=ASM&appCode=starter-credential&appName=%E6%9C%8D%E5%8A%A1%E5%B1%82&sysCode=dmall-srm&env=test`

```json
{"name":"list-deployment-instances","description":"Lists deduplicated deployment instances from the current logged-in RDMS tab. The tab must already be at the exact deployment route described by appCode, sysCode, env, and appName.","mode":"read","toolName":"rdms_list_deployment_instances","published":true,"contractVersion":"2","resultMetadata":true,"scope":{"origin":"https://rdms.dmall.com","url":"https://rdms.dmall.com/#index/environment/dmallenv/appdetail:versionType=ASM&appCode=starter-credential&appName=%E6%9C%8D%E5%8A%A1%E5%B1%82&sysCode=dmall-srm&env=test"},"inputSchema":{"type":"object","properties":{"appCode":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._-]+$"},"sysCode":{"type":"string","minLength":1,"maxLength":128,"pattern":"^[A-Za-z0-9._-]+$"},"env":{"type":"string","minLength":1,"maxLength":32,"pattern":"^[A-Za-z0-9_-]+$"},"appName":{"type":"string","minLength":1,"maxLength":128}},"required":["appCode","sysCode","env","appName"],"additionalProperties":false},"outputSchema":{"type":"object","properties":{"toolVersion":{"type":"string"},"route":{"type":"string"},"count":{"type":"integer"},"instances":{"type":"array"}},"required":["toolVersion","route","count","instances"],"additionalProperties":false},"maxOutputChars":12000,"plan":{"version":1,"rootSelector":"div.x-module.x-box-line.x-box-root:has(.x-table-wrapper.main table.x-content-table)","wait":{"selector":".x-table-wrapper.main table.x-content-table tbody","timeoutMs":5000},"collection":{"selector":".x-table-wrapper.main table.x-content-table","rowSelector":"tbody tr"},"fields":{"instanceName":{"selector":"td:nth-of-type(1)"},"healthStatus":{"selector":"td:nth-of-type(2)"},"imageVersion":{"selector":"td:nth-of-type(3)"},"instanceIp":{"selector":"td:nth-of-type(4)"},"hostIp":{"selector":"td:nth-of-type(5)"},"unit":{"selector":"td:nth-of-type(6)"},"instanceStatus":{"selector":"td:nth-of-type(7)"},"startTime":{"selector":"td:nth-of-type(8)"},"restartCount":{"selector":"td:nth-of-type(9)"}},"dedupeBy":"instanceName","requireRows":true,"output":{"key":"instances","fields":{"instanceName":"instanceName","healthStatus":"healthStatus","imageVersion":"imageVersion","instanceIp":"instanceIp","hostIp":"hostIp","unit":"unit","instanceStatus":"instanceStatus","startTime":"startTime","restartCount":"restartCount"}}}}
```

## Returns

A JSON object with `toolVersion`, the exact `route`, `count`, and an `instances` array. Each item contains `instanceName`, `healthStatus`, `imageVersion`, `instanceIp`, `hostIp`, `unit`, `instanceStatus`, `startTime`, and `restartCount`.
