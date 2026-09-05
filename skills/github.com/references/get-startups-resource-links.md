# Get GitHub for Startups Resource Links

## Action: get-startups-resource-links


## Requirements

- Navigate to GitHub's public GitHub for Startups page.
- This is a read-only action. It does not follow links, sign in, apply through a partner, start a trial, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub for Startups page is loaded. It returns visible partner, platform, support, events, funding, and learning-resource links promoted by the program.

## Action

## Navigate to

`https://github.com/enterprise/startups`

```js
({ name: "get_startups_resource_links", description: "Returns visible GitHub for Startups partner, product, support, events, funding, and learning-resource links.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["See our partners", "Start a free trial", "See GitHub Enterprise", "Explore GitHub Copilot", "See GitHub Advanced Security", "Apply to become a GitHub for Startups Partner", "Contact sales", "GitHub events", "Attract funding", "Learning Pathways", "Explore events", "Check out GitHub Fund", "Browse resources"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var resources = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; resources.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: resources }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub for Startups resource links and their destinations.
