# Get GitHub Features Page Categories

## Action: get-features-page-categories


## Requirements

- Navigate to GitHub's public Features page.
- This is a read-only action. It does not sign in, open menus, follow links, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub Features page is loaded. It returns the visible feature-category navigation targets and indicates whether the page advertises governance and community sections.

## Action

## Navigate to

`https://github.com/features`

```js
({ name: "get_features_page_categories", description: "Returns visible GitHub Features category navigation links and section availability from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Collaborative coding", "Automation & CI/CD", "Application security", "Client apps", "Project management"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var categories = names.map(function(name) { var link = links.find(function(item) { return clean(item.textContent) === name; }); return link ? { name: name, href: link.href } : null; }).filter(function(item) { return item !== null; }); var bodyText = clean(document.body ? document.body.textContent : ""); var result = { url: window.location.href, title: document.title, categories: categories, additionalSections: { governanceAndAdministration: bodyText.indexOf("Governance & administration") >= 0, community: bodyText.indexOf("Community") >= 0, pricingCallToAction: bodyText.indexOf("View pricing plans") >= 0 } }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible category navigation links, and availability indicators for governance, community, and pricing content.
