# Get GitHub Copilot Page Summary

## Action: get-copilot-page-summary


## Requirements

- Navigate to the public GitHub Copilot product page.
- This is a read-only action. It does not sign in, submit forms, change plans, or modify site preferences.

## How to run this action

Run this action while the GitHub Copilot product page is loaded. It reads the visible page title, primary headline, section headings, workflow messaging, and available plan-category tabs.

## Action

## Navigate to

`https://github.com/features/copilot`

```js
({ name: "get_copilot_page_summary", description: "Returns the visible GitHub Copilot product-page headline, sections, workflow messaging, and plan categories.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")).map(function(item) { return clean(item.textContent); }).filter(function(text) { return text.length > 0; }); var bodyText = clean(document.body ? document.body.textContent : ""); var planTabs = ["For individuals", "For businesses"].map(function(name) { var button = Array.prototype.slice.call(document.querySelectorAll('button[role="tab"]')).find(function(item) { return clean(item.textContent) === name; }); return { name: name, visible: !!button, selected: button ? button.getAttribute("aria-selected") === "true" : false }; }); var faqTabs = ["General", "Plans & Pricing", "Privacy", "Responsible AI"].map(function(name) { var button = Array.prototype.slice.call(document.querySelectorAll('button[role="tab"]')).find(function(item) { return clean(item.textContent) === name; }); return { name: name, visible: !!button, selected: button ? button.getAttribute("aria-selected") === "true" : false }; }); var result = { url: window.location.href, title: document.title, headline: headings.length ? headings[0] : null, headings: headings, messaging: { hero: bodyText.indexOf("Your AI accelerator for every workflow") >= 0, workflow: bodyText.indexOf("Code, command, and collaborate") >= 0, organization: bodyText.indexOf("Tailor-made for your organization") >= 0, plans: bodyText.indexOf("Take flight with GitHub Copilot") >= 0 }, planTabs: planTabs, faqTabs: faqTabs }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current URL and title, visible headings, detection of the page's main messaging sections, and the available or selected plan and FAQ tabs.
