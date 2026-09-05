# Get GitHub Copilot Navigation Links

## Action: get-copilot-navigation-links


## Requirements

- Navigate to the public GitHub Copilot product page.
- This is a read-only action. It does not follow links, sign in, start a trial, contact sales, or change account settings.

## How to run this action

Run this action while the GitHub Copilot product page is loaded. It collects visible links for Copilot products, exploration paths, organization features, plans, resources, and calls to action using the link labels exposed on the page.

## Action

## Navigate to

`https://github.com/features/copilot`

```js
({ name: "get_copilot_navigation_links", description: "Returns visible GitHub Copilot product, feature, plan, resource, and call-to-action links from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Desktop App", "Copilot in VS Code", "Agents on GitHub", "Copilot CLI", "For Business", "Tutorials", "Plans & Pricing", "Get started", "See plans & pricing", "Open now", "Explore the GitHub Copilot app", "Explore Copilot in the IDE", "Explore Copilot cloud agent", "Read customer story", "Turn Copilot into a project expert", "Manage agent usage with enterprise-grade controls", "Secure your MCP integrations", "Compare all plan features", "Preview the latest features", "Explore the GitHub Blog", "Visit the GitHub Copilot Trust Center", "Contact Sales", "Contact sales"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var resultLinks = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); if (text === name) { var key = name + "|" + link.href; if (!seen[key]) { seen[key] = true; resultLinks.push({ text: text, href: link.href }); } } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: resultLinks }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub Copilot links and their destinations.
