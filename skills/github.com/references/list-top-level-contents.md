# List Top-Level Repository Contents

## Action: list-top-level-contents


## Requirements

- Navigate to a GitHub repository's main **Code** page where the root file table is visible.
- This is a read-only action. It does not clone, download, create, edit, or delete repository files.

## How to run this action

Run this action on the repository overview page. It reads the currently visible root-level directory and file rows, deduplicates GitHub's repeated accessible links, and returns each item's name, type, and available commit message.

## Action

## Navigate to

`https://github.com/Mangi-11/Eta`

```js
({ name: "list_top_level_repository_contents", description: "Lists the visible top-level directories and files from the current GitHub repository Code page.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var links = Array.prototype.slice.call(document.querySelectorAll('a[aria-label$=", (Directory)"], a[aria-label$=", (File)"]')); var seen = {}; var items = []; links.forEach(function(link) { var label = link.getAttribute("aria-label") || ""; var match = label.match(/^(.*), \((Directory|File)\)$/); var row = link.closest("tr"); var commitLink = row ? row.querySelector('td:nth-of-type(3) a') : null; var key; if (!match) { return; } key = match[2] + ":" + match[1]; if (seen[key]) { return; } seen[key] = true; items.push({ name: match[1], type: match[2].toLowerCase(), href: link.href, latestCommitMessage: commitLink ? commitLink.textContent.replace(/\s+/g, " ").trim() : null }); }); var result = { url: window.location.href, repository: (document.querySelector('[data-testid="repo-name-link"]') || {}).textContent ? document.querySelector('[data-testid="repo-name-link"]').textContent.replace(/\s+/g, " ").trim() : null, visibleItemCount: items.length, items: items }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object with the current page URL, repository name, number of visible root-level items, and an ordered list of directories and files. Each item includes its name, type, GitHub page URL, and visible latest commit message when available.
