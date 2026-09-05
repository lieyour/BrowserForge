import { URL } from "node:url";
import type { JsonSchema, RunResult } from "../contracts/skill.js";
import { RuntimeError } from "./errors.js";
import { createHelpers, withPage } from "./playwrightAdapter.js";
import { loadSkill } from "./skillLoader.js";

function validateInput(schema: JsonSchema, input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new RuntimeError("INVALID_INPUT", "Input must be an object", undefined, true);
  const object = input as Record<string, unknown>;
  for (const name of Object.keys(object)) if (!(name in schema.properties)) throw new RuntimeError("INVALID_INPUT", `Unknown field: ${name}`, name, true);
  for (const name of schema.required) if (object[name] === undefined || object[name] === "") throw new RuntimeError("INVALID_INPUT", `Missing required field: ${name}`, name, true);
  for (const [name, definition] of Object.entries(schema.properties)) {
    const value = object[name];
    if (value === undefined) continue;
    const isArray = definition.type === "array";
    if ((isArray && !Array.isArray(value)) || (!isArray && typeof value !== "string")) throw new RuntimeError("INVALID_INPUT", `Invalid type for ${name}`, name, true);
    const values = Array.isArray(value) ? value : [value];
    if (definition.enum && values.some((item) => !definition.enum?.includes(String(item)))) throw new RuntimeError("INVALID_INPUT", `Invalid option for ${name}`, name, true);
  }
  return object;
}

export async function runSkill(options: { skillDirectory: string; action: string; input: unknown }): Promise<RunResult> {
  const startedAt = Date.now();
  const counter = { fieldsFilled: 0, domInspectionCount: 0 };
  try {
    const skill = await loadSkill(options.skillDirectory, options.action);
    const input = validateInput(skill.manifest.inputSchema, options.input);
    const target = new URL(skill.manifest.navigation.url);
    if (!["http:", "https:", "file:", "browserforge-fixture:"].includes(target.protocol)) throw new RuntimeError("NAVIGATION_FAILED", "Unsupported navigation protocol");
    const navigationUrl = target.protocol === "browserforge-fixture:"
      ? new URL("../../fixtures/form.html", import.meta.url).href
      : target.href;
    const data = await withPage(async (page) => {
      try {
        await page.goto(navigationUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (error) {
        throw new RuntimeError("NAVIGATION_FAILED", `Could not open ${skill.manifest.navigation.url}: ${error instanceof Error ? error.message : String(error)}`, undefined, true);
      }
      return skill.action({ page, input, helpers: createHelpers(page, counter) });
    });
    return { ok: true, data, telemetry: { exploration: false, durationMs: Date.now() - startedAt, ...counter } };
  } catch (error) {
    const normalized = error instanceof RuntimeError
      ? error
      : new RuntimeError("SUBMIT_FAILED", error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      error: { code: normalized.code, message: normalized.message, field: normalized.field, recoverable: normalized.recoverable },
      telemetry: { exploration: false, durationMs: Date.now() - startedAt, ...counter }
    };
  }
}
