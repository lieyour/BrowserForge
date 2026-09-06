import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";
import { parseReadActionReference, scopeMatches, validateActionOutput } from "../src/readAction.js";

const referencePath = "skills/rdms.dmall.com/references/list-deployment-instances.md";

test("RDMS declarative action has a scoped, deduplicating table plan", async () => {
  const reference = await readFile(referencePath, "utf8");
  const { action } = parseReadActionReference(reference, "list-deployment-instances");
  expect(action).toMatchObject({ mode: "read", published: true, toolName: "rdms_list_deployment_instances", plan: { rootSelector: "div.x-module.x-box-line.x-box-root:has(.x-table-wrapper.main table.x-content-table)", collection: { selector: ".x-table-wrapper.main table.x-content-table" }, dedupeBy: "instanceName", output: { key: "instances" } } });
  expect(action.plan.fields.unit.selector).toBe("td:nth-of-type(6)");
});

test("read action scope and output boundaries reject mismatches", async () => {
  const reference = await readFile(referencePath, "utf8");
  const { action } = parseReadActionReference(reference, "list-deployment-instances");
  expect(scopeMatches(action.scope, action.scope.url)).toBe(true);
  expect(scopeMatches(action.scope, "https://rdms.dmall.com/#index/environment/dmallenv/appdetail:versionType=ASM&appCode=starter-credential&appName=x&sysCode=dmall-srm&env=uat")).toBe(false);
  expect(() => validateActionOutput({ type: "object", required: ["instances"] }, { instances: ["x".repeat(30)] }, 10)).toThrow("exceeds maxOutputChars");
});

test("legacy function actions and invalid plans are rejected with migration errors", async () => {
  const legacy = await readFile("skills/rdms.dmall.com/references/get-current-page-information.md", "utf8");
  expect(() => parseReadActionReference(legacy, "get-current-page-information")).toThrow("migrated");
  const reference = await readFile(referencePath, "utf8");
  expect(() => parseReadActionReference(reference.replace('"dedupeBy":"instanceName"', '"dedupeBy":"missing"'), "list-deployment-instances")).toThrow("dedupeBy");
  expect(() => parseReadActionReference(reference.replace('"rootSelector":"div.x-module.x-box-line.x-box-root:has(.x-table-wrapper.main table.x-content-table)"', '"rootSelector":"body"'), "list-deployment-instances")).toThrow("scoped module");
  expect(() => parseReadActionReference(reference.replace('"rootSelector":"div.x-module.x-box-line.x-box-root:has(.x-table-wrapper.main table.x-content-table)"', '"rootSelector":"main > section > table.x-content-table"'), "list-deployment-instances")).not.toThrow();
  expect(() => parseReadActionReference(reference.replace('"version":1,"rootSelector"', '"version":1,"operation":"click","rootSelector"'), "list-deployment-instances")).toThrow("unknown field operation");
});

test("max output and metadata validation use legacy-safe defaults", async () => {
  const reference = await readFile(referencePath, "utf8");
  const withoutMetadata = reference.replace(',"toolName":"rdms_list_deployment_instances","published":true,"contractVersion":"2","resultMetadata":true', "");
  expect(parseReadActionReference(withoutMetadata, "list-deployment-instances").action).toMatchObject({ published: false, risk: "read", contractVersion: "1", resultMetadata: false });
  expect(() => parseReadActionReference(reference.replace('"maxOutputChars":12000', '"maxOutputChars":0'), "list-deployment-instances")).toThrow("integer from 1");
  expect(() => parseReadActionReference(reference.replace(',"maxOutputChars":12000', ""), "list-deployment-instances")).toThrow("integer from 1");
});

test("standard array item schemas are accepted", async () => {
  const reference = await readFile(referencePath, "utf8");
  const nestedOutput = reference.replace('"instances":{"type":"array"}', '"instances":{"type":"array","items":{"type":"object","properties":{"instanceName":{"type":"string"}},"required":["instanceName"],"additionalProperties":false}}');
  expect(() => parseReadActionReference(nestedOutput, "list-deployment-instances")).not.toThrow();
});
