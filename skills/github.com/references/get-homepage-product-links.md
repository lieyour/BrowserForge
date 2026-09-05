# Get Homepage Product Links

## Action: get-homepage-product-links


## Requirements

- Navigate to the public GitHub homepage.
- This is a read-only action. It does not sign in, submit email addresses, or change site preferences.

## How to run this action

Run this action while GitHub's public homepage is loaded. It returns the visible links to the primary GitHub platform products and security offerings promoted on the page.

## Action

## Navigate to

`https://github.com/`

```js
({ name: "get_github_homepage_product_links", description: "Returns visible GitHub product and security links promoted on the public homepage.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var names = ["Explore GitHub Copilot", "Explore GitHub Actions", "Explore GitHub Codespaces", "Explore GitHub Mobile", "Explore GitHub Marketplace", "Explore GitHub Advanced Security", "Learn about GitHub Code Security", "Learn about Dependabot", "Learn about GitHub Secret Protection", "Explore GitHub Projects", "Explore GitHub Issues", "Explore GitHub Discussions", "Explore code review", "Explore GitHub Sponsors"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var products = names.map(function(name) { var link = links.find(function(item) { return (item.textContent || "").replace(/\s+/g, " ").trim() === name; }); return { name: name, href: link ? link.href : null, visible: !!link }; }); var result = { url: window.location.href, title: document.title, products: products.filter(function(item) { return item.visible; }) }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current URL, page title, and visible homepage product links with their destinations.
