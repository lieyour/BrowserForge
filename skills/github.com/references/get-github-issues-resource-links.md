# Get GitHub Issues Resource Links

## Action: get-github-issues-resource-links


## Requirements

- Navigate to GitHub's public GitHub Issues feature page.
- This is a read-only action. It does not follow links, sign in, start using projects, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub Issues feature page is loaded. It returns visible calls to action and product-resource links promoted for GitHub Issues.

## Action

## Navigate to

`https://github.com/features/issues`

```js
({ name: "get_github_issues_resource_links", description: "Returns visible GitHub Issues calls to action and CLI, mobile, and Copilot CLI resource links.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Start using projects", "Contact sales", "GitHub CLI", "GitHub Mobile", "GitHub Copilot CLI"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var resources = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; resources.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: resources }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub Issues calls to action and resource links with their destinations.
