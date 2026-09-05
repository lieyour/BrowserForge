# Get GitHub Issues Page Summary

## Action: get-github-issues-page-summary


## Requirements

- Navigate to GitHub's public GitHub Issues feature page.
- This is a read-only action. It does not sign in, create projects or issues, contact sales, or change site preferences.

## How to run this action

Run this action while the public GitHub Issues feature page is loaded. It reads the visible page headline and identifies the advertised issue-planning, project-management, workflow, and command-line capabilities.

## Action

## Navigate to

`https://github.com/features/issues`

```js
({ name: "get_github_issues_page_summary", description: "Returns the visible GitHub Issues headline and advertised planning, project-management, and automation capabilities.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var clean = function(value) { return (value || "").replace(/\s+/g, " ").trim(); }; var bodyText = clean(document.body ? document.body.textContent : ""); var phrases = [{ name: "Sub-issues and progress indicators", phrase: "Break issues into sub-issues" }, { name: "Markdown conversations and references", phrase: "Streamline conversations" }, { name: "Custom project fields", phrase: "Custom fields" }, { name: "Project insights and burn up charts", phrase: "Track progress with project insights" }, { name: "Reusable project templates", phrase: "Share best practices with project templates" }, { name: "Automated workflows", phrase: "Manage work automatically" }, { name: "Table, board, and roadmap views", phrase: "Switch to tables and roadmaps" }, { name: "Keyboard-driven issue management", phrase: "No mouse? No problem." }, { name: "GitHub CLI issue management", phrase: "View, update, and create issues without ever leaving your terminal." }, { name: "GitHub Mobile issue management", phrase: "Create and manage issues on the go" }, { name: "Copilot CLI issue support", phrase: "search, summarize, update, and implement GitHub issues" }]; var capabilities = phrases.filter(function(item) { return bodyText.indexOf(item.phrase) >= 0; }).map(function(item) { return item.name; }); var result = { url: window.location.href, title: document.title, product: bodyText.indexOf("GITHUB ISSUES") >= 0 ? "GitHub Issues" : null, headline: bodyText.indexOf("Create issues, break them into sub-issues") >= 0 ? "Create issues, break them into sub-issues, track progress, add custom fields, and have conversations." : null, capabilities: capabilities, faqAvailable: bodyText.indexOf("Frequently Asked Questions") >= 0, projectsMentioned: bodyText.indexOf("What are Projects?") >= 0 }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing the current page URL and title, product label, visible headline, detected GitHub Issues capabilities, and indicators for the FAQ and Projects content.
