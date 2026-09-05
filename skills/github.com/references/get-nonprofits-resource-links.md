# Get GitHub for Nonprofits Resource Links

## Action: get-nonprofits-resource-links


## Requirements

- Navigate to GitHub's public GitHub for Nonprofits page.
- This is a read-only action. It does not follow links, sign in, apply to the program, contact GitHub, subscribe to communications, or change site preferences.

## How to run this action

Run this action while the public GitHub for Nonprofits page is loaded. It returns the visible program application and contact links.

## Action

## Navigate to

`https://github.com/solutions/industry/nonprofits`

```js
({ name: "get_nonprofits_resource_links", description: "Returns visible GitHub for Nonprofits application and contact links from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Join GitHub for Nonprofits", "Contact us"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var results = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; results.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: results }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub for Nonprofits application and contact links with their destinations.
