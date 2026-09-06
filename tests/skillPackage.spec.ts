import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { normalizeSkillPackage, prepareGeneratedSkillPackage, validateSkillPackage, writeSkillPackage } from "../src/generator/skillPackage.js";
import { parseReadActionReference } from "../src/readAction.js";
import { parseWriteActionReference } from "../src/writeAction.js";

function reference(action = "search", metadata: Record<string, unknown> = {}) {
  const plan = { version: 1, rootSelector: "[data-module=search]", collection: { selector: "[data-results]", rowSelector: "[data-result]" }, fields: { value: { selector: "[data-value]" } }, dedupeBy: "value", output: { key: "results", fields: { value: "value" } } };
  const contract = { name: action, description: "Search Example Test.", mode: "read", scope: { origin: "https://example.test", url: `https://example.test/${action}` }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { results: { type: "array" } }, required: ["results"] }, maxOutputChars: 500, plan, ...metadata };
  return `# Example Test — Search Reference\n\n## Action: ${action}\n\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n`;
}

function writeReference(action = "create-order", metadata: Record<string, unknown> = {}) {
  const contract = {
    name: action, description: "Create an order.", mode: "write", operation: "create",
    scope: { origin: "https://example.test", url: "https://example.test/orders/new" },
    inputSchema: { type: "object", properties: { item: { type: "string" }, quantity: { type: "integer" }, expedited: { type: "boolean" } }, required: ["item", "quantity", "expedited"], additionalProperties: false },
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
    maxOutputChars: 1000,
    plan: { version: 1, fields: { item: { selector: '[data-testid="item"]', kind: "fill" }, quantity: { selector: '[data-testid="quantity"]', kind: "select" }, expedited: { selector: '[data-testid="expedited"]', kind: "check" } }, submitSelector: '[data-testid="submit"]', successSelector: '[data-testid="success"]', failureSelector: '[data-testid="failure"]', timeoutMs: 1000, confirmText: "Create this order?" },
    ...metadata
  };
  return `# Example Test — Create order\n\n## Action: ${action}\n\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n`;
}

const generated = { skill: "---\nname: browsing-example-test\ndescription: Use when the user wants to search Example Test.\n---\n", references: [{ filename: "search.md", content: reference() }] };

test("accepts and writes a browsing-skills package", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "browserforge-package-"));
  const written = await writeSkillPackage("example.test", validateSkillPackage(generated), directory);
  expect(written.actions).toEqual(["search"]);
  await expect(readFile(resolve(written.directory, "SKILL.md"), "utf8")).resolves.toContain("name: browsing-example-test");
});

test("keeps legacy metadata runnable through the generic path", () => {
  expect(validateSkillPackage(generated)).toMatchObject({ references: [{ filename: "search.md" }] });
});

test("rejects invalid contract metadata and duplicate published tools", () => {
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "search.md", content: reference("search", { published: true, toolName: "bad-name" }) }] })).toThrow("toolName");
  const published = reference("search", { published: true, toolName: "example_search" });
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "search.md", content: published }, { filename: "find.md", content: reference("find", { published: true, toolName: "example_search" }) }] })).toThrow("duplicate published tool name");
});

test("rejects JavaScript actions and malformed plans", () => {
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "search.md", content: "# Search\n## Action: search\n```js\n({ execute: async function() {} })\n```" }] })).toThrow("migrated");
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "search.md", content: reference().replace('"rowSelector":"[data-result]"', '"rowSelector":""') }] })).toThrow("rowSelector");
});

test("rejects incomplete Skill frontmatter and untitled references", () => {
  expect(() => validateSkillPackage({ ...generated, skill: generated.skill.replace("\n---\n", "\n") })).toThrow("complete browsing-skills frontmatter");
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "search.md", content: reference().replace(/^# [^\n]+\n\n/, "") }] })).toThrow("Markdown title");
});

test("adds a missing Action heading before validation", () => {
  const withoutHeading = { ...generated, references: [{ ...generated.references[0], content: generated.references[0].content.replace("## Action: search\n\n", "") }] };
  expect(validateSkillPackage(normalizeSkillPackage(withoutHeading))).toMatchObject({ references: [{ filename: "search.md" }] });
});

test("normalizes terra frontmatter-shaped references without changing the action JSON", () => {
  const malformed = {
    skill: generated.skill.replace("\n---\n", "\n"),
    references: [{ filename: "search.md", content: `---\nname: search\ndescription: Search records.\n\n## Requirements\n\n- Open the page.\n\n## Action\n\n${reference().match(/\`\`\`json[\s\S]*\`\`\`/)?.[0]}\n` }]
  };
  const normalized = normalizeSkillPackage(malformed) as typeof generated;
  expect(normalized.skill).toMatch(/^---\nname: browsing-example-test\ndescription: .+\n---\n/);
  expect(normalized.references[0].content).toMatch(/^# Search\n\n## Action: search\n/);
  expect(() => validateSkillPackage(normalized)).not.toThrow();
});

test("generated read actions are published with route inputs", () => {
  const url = "https://example.test/search?query=alpha&page=1";
  const routed = { ...generated, references: [{ filename: "search.md", content: reference().replace('"url":"https://example.test/search"', `"url":"${url}"`) }] };
  const prepared = validateSkillPackage(prepareGeneratedSkillPackage(routed, url) as typeof generated);
  const action = parseReadActionReference(prepared.references[0].content, "search").action;
  expect(action).toMatchObject({ published: true, toolName: "example_test_search", scope: { urlTemplate: "https://example.test/search?query={query}&page={page}" } });
  expect(action.inputSchema.required).toEqual(["query", "page"]);
});

test("generated write actions are validated, published, and assigned a stable tool name", () => {
  const url = "https://example.test/orders/new?tenant=demo";
  const packageValue = { ...generated, references: [{ filename: "create-order.md", content: writeReference().replace('"url":"https://example.test/orders/new"', `"url":"${url}"`) }] };
  const prepared = validateSkillPackage(prepareGeneratedSkillPackage(packageValue, url) as typeof generated);
  const action = parseWriteActionReference(prepared.references[0].content, "create-order").action;
  expect(action).toMatchObject({ mode: "write", operation: "create", published: true, toolName: "example_test_create_order", scope: { urlTemplate: "https://example.test/orders/new?tenant={tenant}" } });
  expect(action.inputSchema.required).toEqual(["item", "quantity", "expedited", "tenant"]);
});

test("rejects mixed-mode generated packages and malformed write references", () => {
  expect(() => validateSkillPackage({ ...generated, references: [...generated.references, { filename: "create-order.md", content: writeReference() }] })).toThrow("must not mix read and write");
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "create-order.md", content: writeReference().replace('"kind":"fill"', '"kind":"click"') }] })).toThrow("kind is invalid");
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "create-order.md", content: writeReference().replace('[data-testid=\\"item\\"]', 'window.form') }] })).toThrow("valid CSS selector");
  expect(() => validateSkillPackage({ ...generated, references: [{ filename: "create-order.md", content: writeReference().replace(/```json[\s\S]*```/, "```js\nwindow.fetch('/orders')\n```") }] })).toThrow("migrated");
});
