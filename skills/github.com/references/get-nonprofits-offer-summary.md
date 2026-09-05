# Get GitHub for Nonprofits Offer Summary

## Action: get-nonprofits-offer-summary


## Requirements

- Navigate to GitHub's public GitHub for Nonprofits page.
- This is a read-only action. It does not sign in, apply to the program, contact GitHub, or change site preferences.

## How to run this action

Run this action while the public GitHub for Nonprofits page is loaded. It reads the visible program headline, verified-nonprofit offers, Developer Pack availability, eligibility criteria, and FAQ availability.

## Action

## Navigate to

`https://github.com/solutions/industry/nonprofits`

```js
({ name: "get_nonprofits_offer_summary", description: "Returns the visible GitHub for Nonprofits offers, eligibility criteria, Developer Pack availability, and FAQ availability.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var headings = Array.prototype.slice.call(document.querySelectorAll("h1, h2, h3")).map(function(item) { return clean(item.textContent); }).filter(function(text) { return text.length > 0; }); var result = { url: window.location.href, title: document.title, program: bodyText.indexOf("GITHUB FOR NONPROFITS") >= 0 ? "GitHub for Nonprofits" : null, headline: headings.length ? headings[0] : null, offers: { freeGitHubTeamPlan: bodyText.indexOf("Free access to a GitHub Team plan") >= 0, enterpriseCloudDiscount: bodyText.indexOf("25% off GitHub Enterprise Cloud") >= 0, enterpriseCloudDiscountPercent: bodyText.indexOf("25% off the GitHub Enterprise cloud plan") >= 0 ? 25 : null, nonprofitDeveloperPack: bodyText.indexOf("Unlock the Nonprofit Developer Pack") >= 0 }, eligibility: { nonprofitStatus: bodyText.indexOf("501(c)(3) or equivalent") >= 0, nonGovernmental: bodyText.indexOf("non-governmental") >= 0, nonAcademic: bodyText.indexOf("non-academic") >= 0, nonCommercial: bodyText.indexOf("non-commercial") >= 0, nonPolitical: bodyText.indexOf("non-political") >= 0, unlimitedPrivateRepositories: bodyText.indexOf("unlimited private repositories") >= 0, unlimitedUsers: bodyText.indexOf("unlimited users") >= 0 }, messaging: { visibilityAndImpact: bodyText.indexOf("Increase visibility and widen impact") >= 0, openSourceCommunity: bodyText.indexOf("Tap into the open source community") >= 0, sustainableDevelopmentGoals: bodyText.indexOf("Sustainable Development Goals") >= 0 }, faqAvailable: bodyText.indexOf("Frequently Asked Questions") >= 0 }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible program headline, available offers, detected eligibility criteria, key program messaging, and FAQ availability.
