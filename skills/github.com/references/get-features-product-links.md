# Get GitHub Features Product Links

## Action: get-features-product-links


## Requirements

- Navigate to GitHub's public Features page.
- This is a read-only action. It does not sign in, follow links, start a trial, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub Features page is loaded. It returns visible product and capability links promoted across the collaboration, automation, security, client-app, and project-management sections.

## Action

## Navigate to

`https://github.com/features`

```js
({ name: "get_features_product_links", description: "Returns visible GitHub product and capability links promoted on the public Features page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["GitHub Codespaces", "GitHub Copilot", "Pull requests", "Discussions", "Code search & code view", "Code review", "GitHub Actions", "GitHub Packages", "GitHub Marketplace", "Code scanning", "GitHub Copilot Autofix", "Secret scanning", "Dependabot alerts", "GitHub Mobile", "GitHub CLI", "GitHub Desktop", "GitHub Projects", "GitHub Issues", "Milestones", "Organizations", "Teams", "Repository rules", "GitHub Sponsors", "GitHub Skills", "Electron", "Education"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var products = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; products.push({ name: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: products }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub product and capability links with their destinations.
