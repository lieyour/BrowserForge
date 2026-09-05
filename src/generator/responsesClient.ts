import type { ExistingSkillPackage, GeneratedSkillPackage } from "./skillPackage.js";
import { normalizeSkillPackage, validateSkillPackage } from "./skillPackage.js";

export type PageSnapshot = {
  url: string;
  title: string;
  visibleText: string;
  elements: Array<Record<string, unknown>>;
  screenshot?: string;
};

const instructions = `You generate one website skill following the browsing-skills repository convention.
Return JSON only: {"skill":"...","references":[{"filename":"action-name.md","content":"..."}]}.
The skill must have frontmatter beginning exactly with --- then name: browsing-<domain> and a concise description, followed by an Action Index with links to references/*.md.
Each reference must include Requirements, How to run this action, an Action section, Navigate to, exactly one js code block, and Returns.
Each code block must be one self-contained JavaScript action object: ({ name, description, inputSchema, execute: async function(params) { ... } }). Use var, never let/const/import/require. Return { content: [{ type: "text", text: JSON.stringify(...) }] }.
Generate 1-3 high-value actions supported by the observed current page. Prefer read-only actions. If a write action is genuinely useful, state that it is opt-in in both description and requirements. Use only selectors and page facts present in the supplied snapshot. Never use cookies, tokens, secrets, local paths, external imports, or API calls.
When existing site Skill content is supplied, return only references that are new for this page or that must be explicitly updated. Do not return an existing reference merely to copy it; unreturned references are preserved by the local service.`;

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

async function callResponses(endpoint: string, apiKey: string, model: string, input: unknown) {
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model, input }),
      signal: AbortSignal.timeout(60_000)
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") throw new Error("Responses API timed out after 60 seconds");
    throw error;
  }
  if (!response.ok) throw new Error(`Responses API failed (${response.status}): ${(await response.text()).slice(0, 500)}`);
  return parseJson(textFromResponse(await response.json()));
}

export async function generateSkillWithResponses(snapshot: PageSnapshot, existing?: ExistingSkillPackage): Promise<GeneratedSkillPackage> {
  const apiKey = process.env.BROWSERFORGE_API_KEY;
  if (!apiKey) throw new Error("AI is not configured. Set BROWSERFORGE_API_KEY, then restart npm run serve.");
  const baseUrl = process.env.BROWSERFORGE_API_BASE_URL || "https://api.zeekai.cc";
  const path = process.env.BROWSERFORGE_RESPONSES_PATH || "/v1/responses";
  const endpoint = new URL(path, baseUrl).href;
  const model = process.env.BROWSERFORGE_MODEL || "gpt-5.6-luna";
  const existingContext = existing ? { skill: existing.skill.slice(0, 12_000), references: existing.references.map((reference) => ({ filename: reference.filename, content: reference.content.slice(0, 8_000) })) } : undefined;
  const content: Array<Record<string, unknown>> = [{ type: "input_text", text: JSON.stringify({ url: snapshot.url, title: snapshot.title, visibleText: snapshot.visibleText, elements: snapshot.elements, existingSkill: existingContext }) }];
  if (snapshot.screenshot) content.push({ type: "input_image", image_url: snapshot.screenshot, detail: "low" });
  const request = [{ role: "system", content: instructions }, { role: "user", content }];
  let generated = await callResponses(endpoint, apiKey, model, request);
  try {
    return validateSkillPackage(normalizeSkillPackage(generated));
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Output failed validation";
    generated = await callResponses(endpoint, apiKey, model, [
      { role: "system", content: instructions },
      { role: "user", content: `Your previous JSON failed validation: ${reason}. Return a corrected complete JSON package only. Previous package:\n${JSON.stringify(generated)}` }
    ]);
    return validateSkillPackage(normalizeSkillPackage(generated));
  }
}
