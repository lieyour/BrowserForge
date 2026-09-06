# Get Current Page Information

## Action: get-current-page-information


## Requirements

- The Dmall RDMS page must be open at `https://rdms.dmall.com/`.
- This is a read-only action.

## How to run this action

Run the JavaScript action with no input.

## Action

Retrieve the current document title and URL to confirm which RDMS page is loaded.

## Navigate to

`https://rdms.dmall.com/`

```js
({ name: "get_current_page_information", description: "Returns the title and URL of the currently loaded Dmall RDMS page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var result = { title: document.title, url: window.location.href }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page `title` and `url`.
