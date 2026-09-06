# Read Access Request Identity

## Action: read-access-request-identity

## Requirements

- Open the Gatehouse database access request page.
- The applicant and department fields must be available.

## How to run this action

Use this action to retrieve the requester's identity details before reviewing or submitting the request.

```json
{"name":"read-access-request-identity","description":"Read the applicant and department currently selected in a Gatehouse database access request.","mode":"read","contractVersion":"1","scope":{"origin":"http://127.0.0.1:4173","url":"http://127.0.0.1:4173/database-access.html"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"applicant":{"type":"string"},"department":{"type":"string"}},"required":["applicant","department"],"additionalProperties":false},"maxOutputChars":400,"plan":{"version":1,"rootSelector":"#applicant","collection":{"selector":"#applicant","rowSelector":"#applicant"},"fields":{"applicant":{"selector":"#applicant","attribute":"value"},"department":{"selector":"#department","attribute":"value"}},"output":{"key":"accessRequestIdentity","fields":{"applicant":"applicant","department":"department"}}},"published":true,"toolName":"127_0_0_1_read_access_request_identity"}
```

## Navigate to

http://127.0.0.1:4173/database-access.html

## Returns

The current applicant name and selected department for the database access request.
