# Get GitHub Actions Resource Links

## Action: get-actions-resource-links


## Requirements

- Navigate to GitHub's public GitHub Actions feature page.
- This is a read-only action. It does not follow links, sign in, start Actions, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub Actions feature page is loaded. It returns visible calls to action and documentation, marketplace, and pricing resources advertised for GitHub Actions.

## Action

## Navigate to

`https://github.com/features/actions`

```js
({ name: "get_actions_resource_links", description: "Returns visible GitHub Actions calls to action, marketplace, documentation, and pricing links from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Get started with actions", "Contact sales", "Explore the actions marketplace", "Read the GitHub Packages docs", "GitHub Actions is free for public repositories", "Host your own runners or use GitHub-hosted runners"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var resources = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; resources.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: resources }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub Actions resource links and their destinations.
