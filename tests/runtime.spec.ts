import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import { compileSkill } from "../src/compiler/skillCompiler.js";
import { exploreForm } from "../src/explorer/exploreForm.js";
import { runSkill } from "../src/runtime/skillRunner.js";

const fixtureUrl = pathToFileURL(resolve("fixtures/form.html")).href;
let skillDirectory = "";
let action = "";
const input = { firstName: "Ada", email: "ada@example.test", mobile: "1380013800", birthDate: "1990-12-10", gender: "Female", hobbies: ["Music", "Sports"], subject: "Maths", address: "1 Analytical Engine Way" };

async function testSkill(name: string, source: string) {
  const directory = await mkdtemp(resolve(tmpdir(), "browserforge-error-"));
  await mkdir(resolve(directory, "actions"));
  await Promise.all([
    writeFile(resolve(directory, "manifest.json"), JSON.stringify({ name, site: "fixture", version: "1", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, outputSchema: {}, risk: "write", navigation: { url: "browserforge-fixture://local-form" }, generatedAt: "2026-01-01T00:00:00.000Z" })),
    writeFile(resolve(directory, "actions", `${name}.js`), source)
  ]);
  return directory;
}

test.beforeAll(async () => {
  const exploration = await exploreForm(fixtureUrl);
  const generated = await compileSkill(exploration, await mkdtemp(resolve(tmpdir(), "browserforge-")));
  skillDirectory = generated.directory;
  action = generated.name;
});

test("explores, compiles, and runs the local form without a second exploration", async () => {
  for (let run = 0; run < 3; run += 1) {
    const result = await runSkill({ skillDirectory, action, input });
    expect(result).toMatchObject({ ok: true, data: { submitted: true }, telemetry: { exploration: false, fieldsFilled: 8 } });
  }
});

test("rejects missing required input before browser navigation", async () => {
  const result = await runSkill({ skillDirectory, action, input: { ...input, email: undefined } });
  expect(result).toMatchObject({ ok: false, error: { code: "INVALID_INPUT", field: "email" }, telemetry: { fieldsFilled: 0, exploration: false } });
});

test("returns explicit field and success-confirmation errors", async () => {
  const missing = await testSkill("missing", `export default async ({ helpers }) => helpers.fill({ name: "missing", kind: "text", locators: [{ strategy: "css", value: "#missing" }] }, "x");`);
  const noSuccess = await testSkill("no-success", `export default async ({ helpers }) => { await helpers.submit({ label: "Submit", locators: [{ strategy: "css", value: "#submit" }] }); await helpers.confirm([{ strategy: "css", value: "#not-success" }]); };`);
  await expect(runSkill({ skillDirectory: missing, action: "missing", input: {} })).resolves.toMatchObject({ ok: false, error: { code: "FIELD_NOT_FOUND", field: "missing" } });
  await expect(runSkill({ skillDirectory: noSuccess, action: "no-success", input: {} })).resolves.toMatchObject({ ok: false, error: { code: "SUCCESS_NOT_CONFIRMED" } });
});

test("detects browser-side value truncation", async () => {
  const directory = await testSkill("mismatch", `export default async ({ helpers }) => helpers.fill({ name: "mobile", kind: "tel", locators: [{ strategy: "css", value: "#mobile" }] }, "12345678901");`);
  await expect(runSkill({ skillDirectory: directory, action: "mismatch", input: {} })).resolves.toMatchObject({ ok: false, error: { code: "FIELD_VALUE_MISMATCH", field: "mobile" } });
});
