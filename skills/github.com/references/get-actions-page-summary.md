# Get GitHub Actions Page Summary

## Action: get-actions-page-summary


## Requirements

- Navigate to GitHub's public GitHub Actions feature page.
- This is a read-only action. It does not sign in, start Actions, contact sales, change preferences, or trigger workflows.

## How to run this action

Run this action while the public GitHub Actions feature page is loaded. It reads the visible product headline and determines which advertised GitHub Actions capabilities are present on the page.

## Action

## Navigate to

`https://github.com/features/actions`

```js
({ name: "get_actions_page_summary", description: "Returns the visible GitHub Actions headline and advertised workflow automation capabilities from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")).map(function(item) { return clean(item.textContent); }).filter(function(text) { return text.length > 0; }); var capabilities = [{ name: "Hosted runners", phrase: "Hosted runners" }, { name: "Matrix builds", phrase: "Matrix builds" }, { name: "Any language", phrase: "GitHub Actions supports Node.js, Python, Java, Ruby, PHP, Go, Rust, .NET, and more." }, { name: "Live logs", phrase: "See your workflow run in realtime" }, { name: "Built in secret store", phrase: "Built in secret store" }, { name: "Multi-container testing", phrase: "Multi-container testing" }, { name: "Event-triggered workflows", phrase: "Run a workflow on any event" }, { name: "Actions marketplace", phrase: "Actions marketplace" }, { name: "GitHub Packages integration", phrase: "Pair GitHub Packages with Actions" }].map(function(item) { return { name: item.name, visible: bodyText.indexOf(item.phrase) >= 0 }; }); var result = { url: window.location.href, title: document.title, headline: headings.length ? headings[0] : null, headings: headings, capabilities: capabilities.filter(function(item) { return item.visible; }), publicRepositoryFreeTierMentioned: bodyText.indexOf("GitHub Actions is free for public repositories") >= 0 }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible headings, detected GitHub Actions capabilities, and whether the public-repository free-tier message is visible.
