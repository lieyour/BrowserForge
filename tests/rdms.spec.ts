import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { buildRdmsDeploymentUrl, resolveActionRoute } from "../src/actionRegistry.js";
import { parseReadAction, parseReadActionReference, scopeMatches, validateActionInput } from "../src/readAction.js";

const input = { appCode: "starter-credential", sysCode: "dmall-srm", env: "test", appName: "服务层" };

test("RDMS route parameters are encoded and matched exactly", async () => {
  const url = buildRdmsDeploymentUrl(input);
  expect(url).toContain("appName=%E6%9C%8D%E5%8A%A1%E5%B1%82");
  const reference = await readFile("skills/rdms.dmall.com/references/list-deployment-instances.md", "utf8");
  const action = parseReadActionReference(reference, "list-deployment-instances").action;
  const resolved = resolveActionRoute(action, validateActionInput(action.inputSchema, input));
  expect(resolved.scope.url).toBe(url);
  expect(scopeMatches(resolved.scope, url)).toBe(true);
  expect(scopeMatches(resolved.scope, buildRdmsDeploymentUrl({ ...input, env: "uat" }))).toBe(false);
  expect(() => validateActionInput(action.inputSchema, { ...input, unknown: "x" })).toThrow("unknown field");
  expect(() => validateActionInput(action.inputSchema, { ...input, env: "test&write=true" })).toThrow("invalid format");
});

test("declarative route templates resolve without tool-specific code", async () => {
  const reference = await readFile("skills/rdms.dmall.com/references/list-deployment-instances.md", "utf8");
  const action = parseReadActionReference(reference, "list-deployment-instances").action;
  const generic = parseReadAction(JSON.stringify({ ...action, toolName: "rdms_generic_instances", scope: { ...action.scope, urlTemplate: "https://rdms.dmall.com/#instances?appCode={appCode}&env={env}" } }), action.name);
  expect(resolveActionRoute(generic, input).scope.url).toBe("https://rdms.dmall.com/#instances?appCode=starter-credential&env=test");
});
