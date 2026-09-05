# Get Healthcare Resource Links

## Action: get-healthcare-resource-links


## Requirements

- Navigate to GitHub's public Healthcare Solutions page.
- This is a read-only action. It does not follow links, sign in, start a trial, contact sales, subscribe to communications, or change site preferences.

## How to run this action

Run this action while GitHub's public Healthcare Solutions page is loaded. It returns visible product, customer-story, trial, sales, and educational-resource links promoted on the page.

## Action

## Navigate to

`https://github.com/solutions/industry/healthcare`

```js
({ name: "get_healthcare_resource_links", description: "Returns visible GitHub Healthcare Solutions product, customer-story, trial, sales, and educational resource links.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Start a free trial", "Contact sales", "Explore GitHub Copilot", "Explore GitHub Advanced Security", "Explore GitHub Actions", "3M transforms its software toolchain to bring cutting-edge science to customers, faster.", "Philips builds and deploys digital health technology faster with innersource on GitHub.", "GitHub brings DevOps to life and enables streamlined developer experiences at Procter & Gamble.", "Find the right DevOps platform", "What is DevOps?", "Discover innersource"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var results = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; results.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: results }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible healthcare product, customer-story, trial, sales, and educational-resource links with their destinations.
