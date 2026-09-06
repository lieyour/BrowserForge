# Read Daily Worklog Draft

## Action: read-daily-worklog-draft

## Requirements

- Open Folio's daily worklog page.
- The daily completion field must be available.

## How to run this action

Use this action to retrieve the current text entered for today's completed work before submitting the daily worklog.

```json
{"name":"read-daily-worklog-draft","description":"Read the current completed-work draft from today's Folio daily worklog.","mode":"read","contractVersion":"1","scope":{"origin":"http://127.0.0.1:4173","url":"http://127.0.0.1:4173/daily-worklog.html#tasks"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"completedWork":{"type":"string"}},"required":["completedWork"],"additionalProperties":false},"maxOutputChars":600,"plan":{"version":1,"rootSelector":"#completed-work","collection":{"selector":"#completed-work","rowSelector":"#completed-work"},"fields":{"completedWork":{"selector":"#completed-work","attribute":"value"}},"output":{"key":"dailyWorklogDraft","fields":{"completedWork":"completedWork"}}},"published":true,"toolName":"127_0_0_1_read_daily_worklog_draft"}
```

## Navigate to

http://127.0.0.1:4173/daily-worklog.html#tasks

## Returns

The text currently entered in the `今日完成` field for the daily worklog.
