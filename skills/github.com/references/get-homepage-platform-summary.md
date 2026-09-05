# Get Homepage Platform Summary

## Action: get-homepage-platform-summary


## Requirements

- Navigate to the public GitHub homepage.
- This is a read-only action. It does not sign in, submit forms, open navigation menus, or change site preferences.

## How to run this action

Run this action on GitHub's public homepage. It reads the visible headline, supporting introduction, feature tabs, customer-story links, and the public call-to-action labels.

## Action

## Navigate to

`https://github.com/`

```js
({ name: "get_github_homepage_platform_summary", description: "Returns the visible GitHub homepage headline, feature categories, customer stories, and public calls to action.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var findLink = function(text) { return Array.prototype.slice.call(document.querySelectorAll("a")).find(function(item) { return clean(item.textContent) === text; }); }; var tabNames = ["Code", "Plan", "Collaborate", "Automate", "Secure"]; var featureTabs = tabNames.map(function(name) { return Array.prototype.slice.call(document.querySelectorAll('button[role="tab"]')).some(function(button) { return clean(button.textContent) === name; }) ? name : null; }).filter(function(name) { return name !== null; }); var storyLinks = ["TechnologyFigma streamlines development and strengthens securityRead customer story", "AutomotiveMercedes-Benz standardizes source code and automates onboardingRead customer story", "Financial servicesMercado Libre cuts coding time by 50%Read customer story"].map(function(text) { var link = findLink(text); return link ? { text: clean(link.textContent), href: link.href } : null; }).filter(function(item) { return item !== null; }); var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2")).map(function(heading) { return clean(heading.textContent); }).filter(function(text) { return text.length > 0; }); var result = { url: window.location.href, title: document.title, headline: headings[0] || null, headings: headings, featureTabs: featureTabs, customerStories: storyLinks, signupAvailable: !!document.querySelector("#hero_user_email"), copilotAppLink: (findLink("Download GitHub Copilot app") || {}).href || null }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current URL, page title, visible homepage headings, feature tabs, promoted customer stories, and availability of the public signup and Copilot-app links.
