# List Other Publishable Groups

## Action: list-other-publishable-groups


## Requirements

- The Dmall RDMS application deployment page must be open at the specified URL.
- This is a read-only action.

## How to run this action

Run with no input.

## Action

Read the visible group buttons in the `其他可发布的分组` section and return their group names.

## Navigate to

`https://rdms.dmall.com/`

```js
({ name: "list_other_publishable_groups", description: "Lists visible RDMS environment groups that are available for publication.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var buttons = Array.prototype.slice.call(document.querySelectorAll("div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > button")); var groups = buttons.map(function(button) { return button.textContent.trim(); }).filter(function(name) { return name; }); return { content: [{ type: "text", text: JSON.stringify({ groups: groups }) }] }; } })
```

## Returns

A JSON object containing a `groups` array of visible publishable environment-group names.
