# Get Healthcare Solution Summary

## Action: get-healthcare-solution-summary


## Requirements

- Navigate to GitHub's public Healthcare Solutions page.
- This is a read-only action. It does not sign in, start a trial, contact sales, follow links, or change site preferences.

## How to run this action

Run this action while GitHub's public Healthcare Solutions page is loaded. It reads the visible healthcare positioning, platform benefits, featured products, customer stories, and trust claims.

## Action

## Navigate to

`https://github.com/solutions/industry/healthcare`

```js
({ name: "get_healthcare_solution_summary", description: "Returns visible GitHub Healthcare Solutions positioning, benefits, featured products, customer stories, and platform claims.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")).map(function(item) { return clean(item.textContent); }).filter(function(text) { return text.length > 0; }); var benefits = [{ name: "Enhance patient care", phrase: "Enhance patient care" }, { name: "Unlock engineering potential", phrase: "Unlock engineering potential" }, { name: "Streamline healthcare development", phrase: "Streamline healthcare development" }, { name: "AI-powered healthcare innovation", phrase: "Drive healthcare innovation with AI" }, { name: "Patient-data protection", phrase: "Protect patient data" }, { name: "Manual task automation", phrase: "Automate manual tasks" }].filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var customerStories = ["3M transforms its software toolchain to bring cutting-edge science to customers, faster.", "Philips builds and deploys digital health technology faster with innersource on GitHub.", "GitHub brings DevOps to life and enables streamlined developer experiences at Procter & Gamble."].filter(function(text) { return bodyText.indexOf(text) >= 0; }); var result = { url: window.location.href, title: document.title, industry: bodyText.indexOf("HEALTHCARE SOLUTIONS") >= 0 ? "Healthcare Solutions" : null, headline: headings.length ? headings[0] : null, supportingMessage: bodyText.indexOf("By incorporating AI into developer workflows, you can build secure patient care solutions at scale.") >= 0 ? "By incorporating AI into developer workflows, you can build secure patient care solutions at scale." : null, benefits: benefits, featuredProducts: ["GitHub Copilot", "GitHub Advanced Security", "GitHub Actions"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), customerLogos: ["3M", "Amplifon", "Doctolib", "Philips", "Procter and Gamble"].filter(function(name) { return bodyText.toLowerCase().indexOf(name.toLowerCase()) >= 0; }), customerStories: customerStories, claims: { developersCodeUpTo55PercentFaster: bodyText.indexOf("code up to 55% faster") >= 0, fortune100Trust: bodyText.indexOf("Trusted by 90% of the Fortune 100") >= 0, thousandsOfDevOpsIntegrations: bodyText.indexOf("thousands of DevOps integrations") >= 0 } }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible healthcare positioning, benefits, featured products, customer evidence, and detected platform claims.
