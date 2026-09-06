import type { ExistingSkillPackage, GeneratedSkillPackage } from "./skillPackage.js";
import { normalizeSkillPackage, prepareGeneratedSkillPackage, validateSkillPackage } from "./skillPackage.js";
import { parseActionReference } from "../writeAction.js";

export type PageSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  elements: Array<Record<string, unknown>>;
  screenshot?: string;
  generationMode?: "read" | "write";
};

const sharedSkillGenerationInstructions = `You generate one website skill following the browsing-skills repository convention.
Return JSON only: {"skill":"...","references":[{"filename":"action-name.md","content":"..."}]}.
The skill must have frontmatter beginning exactly with --- then name: browsing-<domain> and a concise description, followed by an Action Index with links to references/*.md.
Each reference must include Requirements, How to run this action, an Action section, Navigate to, exactly one json code block, and Returns.
Each code block must be strict JSON containing one declarative action object. name must match the kebab-case filename without .md. Generated actions are published as MCP tools locally after validation; the service assigns publication metadata and safe route parameters. scope.origin must be the URL origin and scope.url must be the supplied snapshot URL, including its route. Do not emit execute functions, arbitrary JavaScript, or selector expressions.
Use only selectors and page facts present in the supplied snapshot; prefer data-testid, id, name, and aria-label selectors over positional or CSS-layout selectors. Never use cookies, tokens, secrets, local paths, external imports, or API calls.
When existing site Skill content is supplied, return only references that are new for this page or that must be explicitly updated. Do not return an existing reference merely to copy it; unreturned references are preserved by the local service.`;

const readSkillGenerationInstructions = `Generate 1-3 read references. Each action must contain: name, description, mode "read", contractVersion "1", scope { origin, url }, inputSchema, outputSchema, maxOutputChars, and plan { version: 1, rootSelector, optional wait, collection { selector, rowSelector }, fields { field: { selector, optional attribute } }, optional dedupeBy, output { key, fields { outputField: "field" } } }. The plan may only read text/attributes under its root element.
Generate 1-3 concrete, high-value user-task actions supported by the observed page, such as listing, searching, filtering, or reading a detail view. Never generate a generic action that only returns the current page title, URL, or raw page text. Every action is read-only and must use the finite plan DSL. Use only selectors and page facts present in the supplied snapshot; prefer data-testid, id, name, and aria-label selectors over positional or CSS-layout selectors. Return only the smallest business fields needed for the task, never a full DOM or full visible text. Never use cookies, tokens, secrets, local paths, external imports, or API calls.
Snapshot elements may include table evidence with selector, headers, rowCount, and columnCount but never row contents. For table actions, use the supplied selector exactly as rootSelector, prefer the matching table with rowCount greater than zero over header-only duplicate tables, use tbody as collection.selector and tr as rowSelector, and map fields only when the observed headers support their column order. Do not invent table selectors.
Do not generate write actions in this request.`;

export const writeSkillGenerationInstructions = `${sharedSkillGenerationInstructions}
Return exactly one reference containing one WriteAction JSON object with: name, description, mode "write", operation "create", "update", "delete", or "submit", contractVersion "1", scope { origin, url }, inputSchema, outputSchema, maxOutputChars, and plan { version: 1, fields { inputProperty: { selector, kind "fill", "select", or "check" } }, submitSelector, successSelector, optional failureSelector, timeoutMs from 100 through 10000, confirmText }. The output schema must describe { submitted, operation, state, optional message }.
Use only selectors and control metadata present in the supplied snapshot. Map observed input, textarea, select, and checkbox controls to plan.fields. Choose exactly one observed button or form control as submitSelector. Require an observed stable success selector; include failureSelector only when stable failure evidence was observed. Do not invent selectors.
Generate one concrete business operation and business tool name. Do not generate read actions in this request. Execution fills declared fields, asks for one confirmation, performs one final click, and reports success, failure, cancellation, validation failure, or timeout. There is no retry, arbitrary JavaScript, navigation instruction, step array, or generic event script.`;

export const skillGenerationInstructions = `${sharedSkillGenerationInstructions}\n${readSkillGenerationInstructions}`;

function textFromResponse(response: any): string {
  if (typeof response.output_text === "string") return response.output_text;
  for (const output of response.output ?? []) for (const content of output.content ?? []) {
    if (typeof content.text === "string") return content.text;
  }
  throw new Error("Responses API returned no text output");
}

function parseJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```json\s*|\s*```$/g, "");
  try { return JSON.parse(trimmed); } catch { throw new Error("Model did not return valid JSON"); }
}

export function responsesTimeoutMs(value = process.env.BROWSERFORGE_RESPONSES_TIMEOUT_MS) {
  const parsed = Number(value ?? 120_000);
  return Number.isInteger(parsed) && parsed >= 1_000 && parsed <= 300_000 ? parsed : 120_000;
}

async function callResponses(endpoint: string, apiKey: string, model: string, input: unknown) {
  const timeoutMs = responsesTimeoutMs();
  for (let attempt = 1; attempt <= 2; attempt++) {
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model, input }),
        signal: AbortSignal.timeout(timeoutMs)
      });
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") throw new Error(`Responses API timed out after ${timeoutMs} ms`);
      throw error;
    }
    if (response.ok) return textFromResponse(await response.json());
    const detail = (await response.text()).slice(0, 500);
    if (attempt < 2 && [429, 502, 503, 504].includes(response.status)) {
      await new Promise((resolve) => setTimeout(resolve, 1_000));
      continue;
    }
    throw new Error(`Responses API failed (${response.status}): ${detail}`);
  }
  throw new Error("Responses API failed after retry");
}

function parseAndValidateSkillPackage(text: string, sourceUrl: string, mode: "read" | "write", existing?: ExistingSkillPackage) {
  const skillPackage = validateSkillPackage(prepareGeneratedSkillPackage(normalizeSkillPackage(parseJson(text)), sourceUrl, existing));
  const actionModes = skillPackage.references.map((reference) => parseActionReference(reference.content, reference.filename.replace(/\.md$/, "")).action.mode);
  if (actionModes.some((actionMode) => actionMode !== mode)) throw new Error(`Generated package must contain only ${mode} actions`);
  if (mode === "write" && skillPackage.references.length !== 1) throw new Error("Write generation must return exactly one action reference");
  return skillPackage;
}

export async function generateSkillWithResponses(snapshot: PageSnapshot, existing?: ExistingSkillPackage): Promise<GeneratedSkillPackage> {
  const apiKey = process.env.BROWSERFORGE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured. Set BROWSERFORGE_API_KEY, then restart npm run serve.");
  const baseUrl = process.env.BROWSERFORGE_API_BASE_URL || "https://api.zeekai.cc";
  const path = process.env.BROWSERFORGE_RESPONSES_PATH || "/v1/responses";
  const endpoint = new URL(path, baseUrl).href;
  const model = process.env.BROWSERFORGE_MODEL || "gpt-5.6-terra";
  const generationMode = snapshot.generationMode ?? "read";
  const instructions = generationMode === "write" ? writeSkillGenerationInstructions : skillGenerationInstructions;
  const existingContext = existing ? { skill: existing.skill.slice(0, 12_000), references: existing.references.map((reference) => ({ filename: reference.filename, content: reference.content.slice(0, 8_000) })) } : undefined;
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: JSON.stringify({ url: snapshot.url, title: snapshot.title, visibleText: snapshot.visibleText, elements: snapshot.elements, generationMode, existingSkill: existingContext }) }];
  if (snapshot.screenshot) content.push({ type: "input_image", image_url: snapshot.screenshot, detail: "low" });
  const request = [{ role: "system", content: instructions }, { role: "user", content }];
  let output = await callResponses(endpoint, apiKey, model, request);
  try {
    return parseAndValidateSkillPackage(output, snapshot.url, generationMode, existing);
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Output failed validation";
    output = await callResponses(endpoint, apiKey, model, [
      { role: "system", content: instructions },
      { role: "user", content: `Your previous output failed validation: ${reason}. Return a corrected complete JSON package only, with no Markdown fence or commentary. Previous output:\n${output.slice(0, 20_000)}` }
    ]);
    return parseAndValidateSkillPackage(output, snapshot.url, generationMode, existing);
  }
}
