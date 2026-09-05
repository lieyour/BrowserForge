# Get Repository Overview

## Action: get-repository-overview


## Requirements

- Navigate to a GitHub repository's main **Code** page.
- This is a read-only action. It does not sign in, modify repository settings, or trigger repository actions.

## How to run this action

Run this action while the repository overview page is loaded. It reads the repository name, visible social metrics, selected branch, latest commit, commit count, and visible release summary.

**Navigate to:**

`https://github.com/Mangi-11/Eta`

```js
({ name: "get_repository_overview", description: "Returns the visible summary, metrics, latest commit, and release information from the current GitHub repository overview page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var textOf = function(selector) { var element = document.querySelector(selector); return element ? element.textContent.replace(/\s+/g, " ").trim() : null; }; var linkText = function(pattern) { var links = Array.prototype.slice.call(document.querySelectorAll("a")); var link = links.find(function(item) { return pattern.test((item.textContent || "") + " " + (item.getAttribute("aria-label") || "") + " " + (item.getAttribute("href") || "")); }); return link ? link.textContent.replace(/\s+/g, " ").trim() : null; }; var parts = window.location.pathname.split("/").filter(Boolean); var overview = { url: window.location.href, repository: textOf("h1") || parts[1] || null, owner: parts[0] || null, branch: textOf("#ref-picker-repos-header-ref-selector"), stars: linkText(/\bstar\b|\/stargazers/i), forks: linkText(/\bforks?\b|\/forks/i), watching: linkText(/\bwatch(?:ing)?\b|\/watchers/i), branches: linkText(/\/branches(?:$|\?)/i), tags: linkText(/\/tags(?:$|\?)/i), latestCommit: { message: textOf('a[aria-label^="Commit "]') ? textOf('div:nth-of-type(1) > div:nth-of-type(2) > div:nth-of-type(1) > span:nth-of-type(1) > a:nth-of-type(1)') : null, shortSha: textOf('a[aria-label^="Commit "]'), totalCommits: linkText(/\/commits\//i) }, latestRelease: textOf('div:nth-of-type(2) > div:nth-of-type(2) > div:nth-of-type(1) > div:nth-of-type(2) > a:nth-of-type(1)') }; return { content: [{ type: "text", text: JSON.stringify(overview) }] }; } })
```

## Returns

A JSON object containing the current page URL, repository and owner names, selected branch, visible stars/forks/watchers/branch/tag counts, latest commit details, and visible latest-release summary. Unavailable page elements are returned as `null`.
