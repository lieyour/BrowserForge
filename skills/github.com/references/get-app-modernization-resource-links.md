# Get App Modernization Resource Links

## Action: get-app-modernization-resource-links


## Requirements

- Navigate to GitHub's public App Modernization Solutions page.
- This is a read-only action. It does not follow links, sign in, contact sales, download extensions, or change site preferences.

## How to run this action

Run this action while GitHub's public App Modernization Solutions page is loaded. It returns visible calls to action and technical resources for GitHub's application-modernization offering.

## Action

## Navigate to

`https://github.com/solutions/use-case/app-modernization`

```js
({ name: "get_app_modernization_resource_links", description: "Returns visible GitHub App Modernization calls to action and Java, .NET, blog, and documentation resource links.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var names = ["Get started", "Contact sales", "Read the technical blog", "Power up your Java application modernization", "Download your Java extension", "Modernize .NET applications with ease", "Learn more about .NET", "Explore the full documentation", "Read the docs"]; var links = Array.prototype.slice.call(document.querySelectorAll("a")); var resources = []; var seen = {}; names.forEach(function(name) { links.forEach(function(link) { var text = clean(link.textContent); var key = text + "|" + link.href; if (text === name && !seen[key]) { seen[key] = true; resources.push({ text: text, href: link.href }); } }); }); return { content: [{ type: "text", text: JSON.stringify({ url: window.location.href, title: document.title, links: resources }) }] }; } })
```

## Returns

A JSON object containing the current page URL and title plus deduplicated visible App Modernization calls to action and technical resource links with their destinations.
