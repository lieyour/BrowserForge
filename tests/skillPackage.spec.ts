import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { test, expect } from "@playwright/test";
import { normalizeSkillPackage, validateSkillPackage, writeSkillPackage } from "../src/generator/skillPackage.js";

const generated = {
  skill: "---\nname: browsing-example-test\ndescription: Use when the user wants to search Example Test.\n---\n\n# Example Test — Browsing Skill\n\n## Action Index\n- **search** — Search. Full spec: [references/search.md](references/search.md).\n",
  references: [{ filename: "search.md", content: "# Example Test — Search Reference\n\n## Requirements\n\nNo authentication required.\n\n## How to run this action\n\nRun the action in page context.\n\n---\n\n## Action: search\n\n**Navigate to:** `https://example.test`\n\n**Code:**\n\n```js\n({\n  name: \"example-test-search\",\n  description: \"Search Example Test.\",\n  inputSchema: { type: \"object\", properties: {} },\n  execute: async function(params) {\n    var result = { query: params.query || \"\" };\n    return { content: [{ type: \"text\", text: JSON.stringify(result) }] };\n  }\n})\n```\n\n**Returns:** `{ query: string }`\n" }]
};

test("accepts and writes a browsing-skills package", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "browserforge-package-"));
  const valid = validateSkillPackage(generated);
  const written = await writeSkillPackage("example.test", valid, directory);
  expect(written.actions).toEqual(["search"]);
  await expect(readFile(resolve(written.directory, "SKILL.md"), "utf8")).resolves.toContain("name: browsing-example-test");
});

test("rejects unsafe generated action code", () => {
  expect(() => validateSkillPackage({ ...generated, references: [{ ...generated.references[0], content: generated.references[0].content.replace("var result", "var secret = document.cookie; var result") }] })).toThrow("reads sensitive browser data");
});

test("adds a missing Action heading before validation", () => {
  const withoutHeading = { ...generated, references: [{ ...generated.references[0], content: generated.references[0].content.replace("## Action: search\n\n", "").replace("**Navigate to:**", "**Open:**") }] };
  expect(validateSkillPackage(normalizeSkillPackage(withoutHeading))).toMatchObject({ references: [{ filename: "search.md" }] });
});
