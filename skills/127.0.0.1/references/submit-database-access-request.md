# Submit Database Access Request

## Action: submit-database-access-request

## Requirements

- Open the Gatehouse database access request page at the exact URL below.
- Review all values before accepting the confirmation dialog.

## How to run this action

Use this action to fill and submit one database access request. The action asks for confirmation immediately before clicking the final submit button.

```json
{"name":"submit-database-access-request","description":"Fill and submit a Gatehouse database access request after explicit confirmation.","mode":"write","operation":"submit","scope":{"origin":"http://127.0.0.1:4173","url":"http://127.0.0.1:4173/database-access.html"},"inputSchema":{"type":"object","properties":{"applicant":{"type":"string","minLength":1,"maxLength":80},"department":{"type":"string","enum":["研发效能部","交易平台部","用户增长部","数据智能部"]},"application":{"type":"string","enum":["nebula-console","atlas-risk","pulse-bi","manual"]},"environment":{"type":"string","enum":["development","staging","production"]},"database":{"type":"string","minLength":1,"maxLength":120},"schemas":{"type":"string","minLength":1,"maxLength":500},"expiresAt":{"type":"string","pattern":"^[0-9]{4}-[0-9]{2}-[0-9]{2}$"},"ticket":{"type":"string","pattern":"^[A-Za-z]+-[0-9]+$"},"reason":{"type":"string","minLength":15,"maxLength":300},"agreement":{"type":"boolean"}},"required":["applicant","department","application","environment","database","schemas","expiresAt","ticket","reason","agreement"],"additionalProperties":false},"outputSchema":{"type":"object","properties":{"submitted":{"type":"boolean"},"operation":{"type":"string"},"state":{"type":"string"},"message":{"type":"string"}},"required":["submitted","operation","state"],"additionalProperties":false},"maxOutputChars":1000,"toolName":"127_0_0_1_submit_database_access_request","risk":"write","published":true,"contractVersion":"1","resultMetadata":false,"plan":{"version":1,"fields":{"applicant":{"selector":"#applicant","kind":"fill"},"department":{"selector":"#department","kind":"select"},"application":{"selector":"#application","kind":"select"},"environment":{"selector":"#environment","kind":"select"},"database":{"selector":"#database","kind":"select"},"schemas":{"selector":"#schemas","kind":"fill"},"expiresAt":{"selector":"#expiresAt","kind":"fill"},"ticket":{"selector":"#ticket","kind":"fill"},"reason":{"selector":"#reason","kind":"fill"},"agreement":{"selector":"#agreement","kind":"check"}},"submitSelector":"[data-testid=\"submit-application\"]","successSelector":"[data-testid=\"application-success\"]","timeoutMs":3000,"confirmText":"确认提交这份数据库权限申请吗？请核对申请人、环境、数据库、权限期限和申请理由。"}}
```

## Navigate to

http://127.0.0.1:4173/database-access.html

## Returns

The submission state and whether the final submit click occurred.
