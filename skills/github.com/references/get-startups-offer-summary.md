# Get GitHub for Startups Offer Summary

## Action: get-startups-offer-summary


## Requirements

- Navigate to GitHub's public GitHub for Startups page.
- This is a read-only action. It does not sign in, apply to the program, start a trial, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub for Startups page is loaded. It reads the visible program positioning, credit offer, advertised platform products, scale guidance, community figures, and FAQ availability.

## Action

## Navigate to

`https://github.com/enterprise/startups`

```js
({ name: "get_startups_offer_summary", description: "Returns the visible GitHub for Startups offer, product coverage, support benefits, community figures, and FAQ availability.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var benefits = [{ name: "Flexible platform credits", phrase: "$10,000 in flexible platform credits" }, { name: "Code security", phrase: "Secure your code at every stage" }, { name: "Tailored onboarding and technical guidance", phrase: "Get guidance to scale" }, { name: "Enterprise CI/CD and packages", phrase: "Build at scale with Enterprise" }, { name: "Copilot coding agent and code review", phrase: "Ship faster with Copilot" }, { name: "Advanced Security protections", phrase: "Secure with Advanced Security" }].filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var products = ["GitHub Enterprise", "GitHub Copilot", "GitHub Advanced Security", "GitHub Actions", "GitHub Code Security", "GitHub Secret Protection", "Dependabot", "GitHub Packages"].filter(function(name) { return bodyText.indexOf(name) >= 0; }); var result = { url: window.location.href, title: document.title, program: bodyText.indexOf("GITHUB FOR STARTUPS") >= 0 ? "GitHub for Startups" : null, headline: bodyText.indexOf("Founders build the future on GitHub") >= 0 ? "Founders build the future on GitHub" : null, creditOffer: bodyText.indexOf("$10,000 in GitHub credits") >= 0 ? { amount: "$10,000", maximumTerm: bodyText.indexOf("for up to 12 months") >= 0 ? "up to 12 months" : null } : null, benefits: benefits, eligibleProductsMentioned: products, community: { startups: bodyText.indexOf("40k Startups in our global community") >= 0 ? "40k" : null, developers: bodyText.indexOf("300k Developers") >= 0 ? "300k" : null, ventureAndEcosystemPartners: bodyText.indexOf("1,000+ Venture and ecosystem partners") >= 0 ? "1,000+" : null }, faqAvailable: bodyText.indexOf("Frequently Asked Questions") >= 0 }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the page URL and title, visible program headline, credit offer, detected benefits and eligible products, community figures, and FAQ availability.
