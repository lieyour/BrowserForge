# Get App Modernization Summary

## Action: get-app-modernization-summary


## Requirements

- Navigate to GitHub's public App Modernization Solutions page.
- This is a read-only action. It does not sign in, contact sales, start an application modernization workflow, play the video, or change site preferences.

## How to run this action

Run this action while GitHub's public App Modernization Solutions page is loaded. It reports the visible product positioning, modernization capabilities, supported application stacks, Azure deployment targets, and migration-effort metrics.

## Action

## Navigate to

`https://github.com/solutions/use-case/app-modernization`

```js
({ name: "get_app_modernization_summary", description: "Returns the visible GitHub App Modernization positioning, capabilities, supported stacks, Azure targets, and reported migration metrics.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var capabilities = [{ name: "Assess, plan, and execute automated upgrades", phrase: "Assess applications at scale, plan application specific journeys, and execute with automated upgrades" }, { name: "Custom skills and software factory patterns", phrase: "Encode your own business logic, define software factory patterns, and standardize outcomes with custom skills" }, { name: "End-to-end migration visibility and control", phrase: "Simplify the migration journey from assessment to deployment with full visibility, control, and predictability" }, { name: "Application-specific migration plans and automated remediation", phrase: "Copilot analyzes codebases, builds migration plans unique to each application, surfaces blockers, and suggests fixes" }, { name: ".NET and Java runtime and framework upgrades", phrase: "Automate upgrades for .NET and Java runtimes and frameworks" }, { name: "Reviewable recommendations and pipeline validation", phrase: "Recommendations are reviewable and every change is validated through your tests and pipelines" }, { name: "Early CVE checks", phrase: "Built-in security checks catch CVEs" }, { name: "Azure migration guidance and security hardening", phrase: "Migrate and deploy easily on Azure services" }].filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var azureTargets = ["Azure App Service", "Azure Container Apps", "Azure Kubernetes Service"].filter(function(name) { return bodyText.indexOf(name) >= 0; }); var result = { url: window.location.href, title: document.title, product: bodyText.indexOf("GITHUB APP MODERNIZATION") >= 0 ? "GitHub App Modernization" : null, headline: bodyText.indexOf("Modernize your applications in days, not months") >= 0 ? "Modernize your applications in days, not months" : null, capabilities: capabilities, supportedStacks: ["Java", ".NET"].filter(function(name) { return bodyText.indexOf(name) >= 0; }), azureDeploymentTargets: azureTargets, reportedMetrics: { migrationTimeReduction: bodyText.indexOf("70% less time spent on migration efforts") >= 0 ? "70% less time spent on migration efforts" : null, appUpgradeEffortReduction: bodyText.indexOf("50% less effort to upgrade apps") >= 0 ? "50% less effort to upgrade apps" : null, codeChangedWithinWeeks: bodyText.indexOf("500k+ lines of code changed within weeks") >= 0 ? "500k+ lines of code changed within weeks" : null } }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, visible product label and headline, detected modernization capabilities, supported stacks, Azure deployment targets, and reported migration metrics.
