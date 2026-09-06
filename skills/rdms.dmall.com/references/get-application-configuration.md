# Get Application Configuration

## Action: get-application-configuration


## Requirements

- The Dmall RDMS application deployment page must be open at the specified URL.
- This is a read-only action.

## How to run this action

Run with no input.

## Action

Read the visible application information panel, including application identity, owner, source repository, AMP mapping, and configured environment domains.

## Navigate to

`https://rdms.dmall.com/#index/environment/dmallenv/appdetail:versionType=ASM&appCode=starter-credential&appName=%E6%9C%8D%E5%8A%A1%E5%B1%82&sysCode=dmall-srm&env=test`

```js
({ name: "get_application_configuration", description: "Returns the visible RDMS application identity, owner, repository, AMP mapping, and configured domain values.", inputSchema: { type: "object", properties: {}, additionalProperties: false }, execute: async function(params) { var text = document.body.innerText.replace(/\s+/g, " "); var readBetween = function(label, nextLabels) { var start = text.indexOf(label); var end = -1; var i = 0; if (start < 0) return ""; start += label.length; for (i = 0; i < nextLabels.length; i += 1) { var candidate = text.indexOf(nextLabels[i], start); if (candidate >= 0 && (end < 0 || candidate < end)) end = candidate; } return text.slice(start, end >= 0 ? end : text.length).trim(); }; var result = { applicationName: readBetween("应用名称", ["应用标识"]), applicationCode: readBetween("应用标识", ["负责人"]), owner: readBetween("负责人", ["git地址"]), gitUrl: readBetween("git地址", ["AMP系统"]), ampSystem: readBetween("AMP系统", ["AMP应用"]), ampApplication: readBetween("AMP应用", ["域名"]), domains: readBetween("域名", ["发布", "分组配置 git提交版本："]).split(" ").filter(function(value) { return value && (value.indexOf(".") >= 0 || value === "uat" || value === "dev" || value === "test"); }) }; return { content: [{ type: "text", text: JSON.stringify(result) }] }; } })
```

## Returns

A JSON object containing `applicationName`, `applicationCode`, `owner`, `gitUrl`, `ampSystem`, `ampApplication`, and visible `domains`.
