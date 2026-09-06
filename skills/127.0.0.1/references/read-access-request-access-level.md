# Read Access Request Access Level

## Action: read-access-request-access-level

## Requirements

- Open the Gatehouse database access request page.
- Access-level radio buttons and the expiration date field must be available.

## How to run this action

Use this action to determine the selected database permission level and its expiration date.

```json
{"name":"read-access-request-access-level","description":"Read the selected access level and expiration date in a Gatehouse database access request.","mode":"read","contractVersion":"1","scope":{"origin":"http://127.0.0.1:4173","url":"http://127.0.0.1:4173/database-access.html"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"accessLevel":{"type":"string"},"expiresAt":{"type":"string"}},"required":["accessLevel","expiresAt"],"additionalProperties":false},"maxOutputChars":300,"plan":{"version":1,"rootSelector":"[data-testid=\"access-read-only\"]","collection":{"selector":"[data-testid=\"access-read-only\"]","rowSelector":"[data-testid=\"access-read-only\"]"},"fields":{"accessLevel":{"selector":"[data-testid=\"access-read-only\"]","attribute":"value"},"expiresAt":{"selector":"#expiresAt","attribute":"value"}},"output":{"key":"accessRequestAccessLevel","fields":{"accessLevel":"accessLevel","expiresAt":"expiresAt"}}},"published":true,"toolName":"127_0_0_1_read_access_request_access_level"}
```

## Navigate to

http://127.0.0.1:4173/database-access.html

## Returns

The selected access-level value and the requested permission expiration date.
