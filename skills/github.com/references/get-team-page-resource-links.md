# Get Team Page Resource Links

## Action: get-team-page-resource-links


## Requirements

- Navigate to GitHub's public GitHub for Teams page.
- This is a read-only action. It does not follow links, sign in, create an organization, begin a plan, or change site preferences.

## How to run this action

Run this action while the public GitHub for Teams page is loaded. It returns visible plan, product, security, customer-story, and related-resource links advertised on the page.

## Action

## Navigate to

`https://github.com/team`

```js
({ name: "get_team_page_resource_links", description: "Returns visible GitHub for Teams plan, product, customer-story, and related-resource links from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Get started with Team", "Sign up for free", "Get started for free", "Continue with Team", "Compare all plans", "Learn more about GitHub Enterprise", "Explore GitHub Actions", "See how GitHub helps secure your applications", "Read more customer stories", "GitHub Actions cheat sheet", "Collaboration is the key to DevOps success", "How healthy teams build better software"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var results = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = name + "|" + link.href; if (text.indexOf(name) === 0 && !seen[key]) { seen[key] = true; results.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: results }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible GitHub for Teams resource links and their destinations.
