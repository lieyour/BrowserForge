# Get DevOps Solution Summary

## Action: get-devops-solution-summary


## Requirements

- Navigate to GitHub's public DevOps Solutions page.
- This is a read-only action. It does not sign in, start a trial, contact sales, open product links, or change site preferences.

## How to run this action

Run this action while GitHub's public DevOps Solutions page is loaded. It reads the visible DevOps positioning, customer logos, advertised platform benefits, and featured GitHub products.

## Action

## Navigate to

`https://github.com/solutions/use-case/devops`

```js
({ name: "get_devops_solution_summary", description: "Returns visible GitHub DevOps positioning, customer logos, platform benefits, and featured products from the current page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var benefits = [{ name: "Increase collaboration", phrase: "Increase collaboration" }, { name: "Eliminate barriers", phrase: "Eliminate barriers" }, { name: "Reduce context switching", phrase: "Reduce context switching" }, { name: "AI-powered developer tools", phrase: "Drive innovation with AI-powered developer tools" }, { name: "Built-in security", phrase: "Built-in security" }, { name: "Streamline team collaboration", phrase: "Streamline team collaboration" }, { name: "Thousands of DevOps integrations", phrase: "thousands of DevOps integrations" }].filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var result = { url: window.location.href, title: document.title, product: bodyText.indexOf("GITHUB DEVOPS") >= 0 ? "GitHub DevOps" : null, headline: bodyText.indexOf("The unified platform for your DevOps lifecycle") >= 0 ? "The unified platform for your DevOps lifecycle" : null, supportingMessage: bodyText.indexOf("Build, scale, and deliver more secure software with GitHub's unified AI-powered developer platform.") >= 0 ? "Build, scale, and deliver more secure software with GitHub's unified AI-powered developer platform." : null, benefits: benefits, featuredProducts: ["GitHub Copilot", "GitHub Advanced Security"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), customerLogos: ["Ford", "Shopify", "NASA", "Vercel", "Spotify", "Vodafone", "Adobe", "Ernst and Young"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), fortune100TrustClaim: bodyText.indexOf("Trusted by 90% of the Fortune 100") >= 0, developerImpactStatistic: bodyText.indexOf("60-75% of developers") >= 0 ? "AI-driven code suggestions enhance job satisfaction and focus for 60-75% of developers" : null }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible DevOps product positioning, benefits, featured products, customer logos, and detected platform claims.
