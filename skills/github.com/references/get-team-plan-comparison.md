# Get Team Plan Comparison

## Action: get-team-plan-comparison


## Requirements

- Navigate to GitHub's public GitHub for Teams page.
- This is a read-only action. It does not sign in, start a plan, submit a signup form, or change site preferences.

## How to run this action

Run this action while the public GitHub for Teams page is loaded. It reads the visible Free and Team plan feature lists, included Actions minutes, and GitHub Packages storage allowances.

## Action

## Navigate to

`https://github.com/team`

```js
({ name: "get_team_plan_comparison", description: "Returns visible GitHub Free and GitHub Team plan features and included usage allowances from the GitHub for Teams page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var plans = [{ name: "GitHub Free", marker: "GitHub Free Basics for teams and developers", features: ["Unlimited public/private repositories", "2,000 Actions minutes/month", "500MB of GitHub Packages storage", "Dependabot", "Community Support"] }, { name: "GitHub Team", marker: "GitHub Team Advanced collaboration and deployment features for teams", features: ["3,000 Actions minutes/month", "2GB of GitHub Packages storage", "GitHub Codespaces", "Protected branches", "Multiple reviewers in pull requests", "Code owners", "Draft pull requests", "Required reviewers", "Pages and Wikis", "Web-based support"] }].map(function(plan) { return { name: plan.name, visible: bodyText.indexOf(plan.marker) >= 0, features: plan.features.filter(function(feature) { return bodyText.indexOf(feature) >= 0; }) }; }); var result = { url: window.location.href, title: document.title, headline: bodyText.indexOf("Build like the best teams on the planet") >= 0 ? "Build like the best teams on the planet" : null, plans: plans, featuredAddOns: ["GitHub Secret Protection", "GitHub Code Security"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), enterpriseAlternativeMentioned: bodyText.indexOf("Need SAML, self-hosting, or priority support?") >= 0 }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible page headline, Free and Team plan feature lists, featured add-ons, and whether the Enterprise alternative is mentioned.
