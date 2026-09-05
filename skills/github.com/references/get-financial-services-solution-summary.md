# Get Financial Services Solution Summary

## Action: get-financial-services-solution-summary


## Requirements

- Navigate to GitHub's public Financial Services Solutions page.
- This is a read-only action. It does not sign in, start a trial, contact sales, follow links, or change site preferences.

## How to run this action

Run this action while GitHub's public Financial Services Solutions page is loaded. It reads the visible industry positioning, platform benefits, featured products, customer logos, testimonial attribution, and platform claims.

## Action

## Navigate to

`https://github.com/solutions/industry/financial-services`

```js
({ name: "get_financial_services_solution_summary", description: "Returns visible GitHub Financial Services positioning, benefits, featured products, customer evidence, and platform claims.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")).map(function(item) { return clean(item.textContent); }).filter(function(text) { return text.length > 0; }); var benefits = [{ name: "Reduce risk", phrase: "Reduce risk" }, { name: "Increase speed and efficiency", phrase: "Increase speed and efficiency" }, { name: "Streamline operations", phrase: "Streamline operations" }, { name: "AI-powered innovation", phrase: "Get ahead with AI-powered innovation" }, { name: "Regulatory compliance and security", phrase: "Enhance regulatory compliance and security" }, { name: "Software development acceleration", phrase: "Accelerate software development" }].filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var result = { url: window.location.href, title: document.title, industry: bodyText.indexOf("FINANCIAL SERVICES") >= 0 ? "Financial Services" : null, headline: headings.length ? headings[0] : null, supportingMessage: bodyText.indexOf("By embedding AI into developer workflows, you can accelerate secure financial innovation at scale.") >= 0 ? "By embedding AI into developer workflows, you can accelerate secure financial innovation at scale." : null, benefits: benefits, featuredProducts: ["GitHub Copilot", "GitHub Advanced Security", "GitHub Actions"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), customerLogos: ["ITAÚ", "MERCARI", "MERCADO LIBRE", "STRIPE", "PLAID"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), testimonial: bodyText.indexOf("GitHub offers us with an all-in-one solution") >= 0 ? { quote: "GitHub offers us with an all-in-one solution that provides developers a single source of truth for security notifications and code management.", attribution: "David Heitzinger, Head of Agile Engineering Support // Raiffeisen Bank" } : null, claims: { fortune100Trust: bodyText.indexOf("Trusted by 90% of the Fortune 100") >= 0, thousandsOfDevOpsIntegrations: bodyText.indexOf("thousands of DevOps integrations") >= 0, secureSupplyChainMentioned: bodyText.indexOf("secure your supply chain") >= 0, applicationSecurityTestingMentioned: bodyText.indexOf("natively-embedded application security testing") >= 0, enterpriseCiCdMentioned: bodyText.indexOf("enterprise-ready, scalable CI/CD") >= 0 } }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible financial-services positioning, benefits, featured products, customer evidence, testimonial details, and detected platform claims.
