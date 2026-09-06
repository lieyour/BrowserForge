# Read Access Request Justification

## Action: read-access-request-justification

## Requirements

- Open the Gatehouse database access request page.
- The Schema / table range, ticket, and application reason fields must be available.

## How to run this action

Use this action to retrieve the request's stated data scope, tracking ticket, and business justification.

```json
{"name":"read-access-request-justification","description":"Read the database scope, related ticket, and justification currently entered in a Gatehouse database access request.","mode":"read","contractVersion":"1","scope":{"origin":"http://127.0.0.1:4173","url":"http://127.0.0.1:4173/database-access.html"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"schemas":{"type":"string"},"ticket":{"type":"string"},"reason":{"type":"string"}},"required":["schemas","ticket","reason"],"additionalProperties":false},"maxOutputChars":1200,"plan":{"version":1,"rootSelector":"#schemas","collection":{"selector":"#schemas","rowSelector":"#schemas"},"fields":{"schemas":{"selector":"#schemas","attribute":"value"},"ticket":{"selector":"#ticket","attribute":"value"},"reason":{"selector":"#reason","attribute":"value"}},"output":{"key":"accessRequestJustification","fields":{"schemas":"schemas","ticket":"ticket","reason":"reason"}}},"published":true,"toolName":"127_0_0_1_read_access_request_justification"}
```

## Navigate to

http://127.0.0.1:4173/database-access.html

## Returns

The entered Schema or table scope, associated requirement or ticket identifier, and application reason.
