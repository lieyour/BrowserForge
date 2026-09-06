import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { codeBlock } from "../readAction.js";
import { parseAction } from "../writeAction.js";

export type GeneratedReference = { filename: string; content: string };
export type GeneratedSkillPackage = { skill: string; references: GeneratedReference[] };
export type ExistingSkillPackage = GeneratedSkillPackage & { directory: string };

const forbiddenText = /(sk-[A-Za-z0-9_-]{12,}|[A-Za-z]:\\|\/Users\/|\/home\/)/;
function referenceTitle(filename: string) {
  return filename.replace(/\.md$/, "").split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

function normalizeSkillFrontmatter(skill: string) {
  if (/^---\nname: browsing-[^\n]+\ndescription: [^\n]+\n---(?:\n|$)/.test(skill)) return skill;
  const name = skill.match(/^name:\s*(browsing-[^\n]+)$/m)?.[1];
  const description = skill.match(/^description:\s*([^\n]+)$/m)?.[1];
  if (!name || !description) return skill;
  const descriptionEnd = skill.indexOf(description) + description.length;
  const body = skill.slice(descriptionEnd).replace(/^\s*(?:---\s*)?/, "");
  return `---\nname: ${name}\ndescription: ${description}\n---\n${body}`;
}

function normalizeReference(reference: GeneratedReference) {
  let content = reference.content;
  if (!content.startsWith("# ")) {
    if (content.startsWith("---\n")) {
      const firstSection = content.search(/^##\s+/m);
      content = firstSection >= 0 ? content.slice(firstSection) : content.replace(/^---\n[\s\S]*?\n---\s*/, "");
    }
    content = `# ${referenceTitle(reference.filename)}\n\n${content.trimStart()}`;
  }
  if (!/^#{1,3}\s+Action\s*:/mi.test(content)) {
    content = content.replace(/^##\s+Action\s*\n/m, "");
    const title = content.match(/^# [^\n]*\n?/);
    const heading = `\n## Action: ${reference.filename.replace(/\.md$/, "")}\n\n`;
    content = title ? `${title[0]}${heading}${content.slice(title[0].length).trimStart()}` : `${heading}${content}`;
  }
  return { ...reference, content };
}

// The Action heading carries no executable meaning. Add it deterministically when a
// model has produced an otherwise complete browsing-skills reference without it.
export function normalizeSkillPackage(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as Partial<GeneratedSkillPackage>).references)) return value;
  const skillPackage = value as GeneratedSkillPackage;
  return {
    ...skillPackage,
    skill: typeof skillPackage.skill === "string" ? normalizeSkillFrontmatter(skillPackage.skill) : skillPackage.skill,
    references: skillPackage.references.map((reference) => !reference || typeof reference.content !== "string" || typeof reference.filename !== "string" ? reference : normalizeReference(reference))
  };
}

function routeTemplate(sourceUrl: string) {
  const url = new URL(sourceUrl);
  const names = new Set<string>();
  const allowed = (name: string) => /^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) && !/(?:token|secret|password|credential|session|signature|auth|key)/i.test(name);
  for (const name of [...url.searchParams.keys()]) if (allowed(name)) names.add(name);
  for (const name of names) url.searchParams.set(name, `{${name}}`);

  const marker = Math.max(url.hash.lastIndexOf("?"), url.hash.lastIndexOf(":"));
  if (marker >= 0 && url.hash.slice(marker + 1).includes("=")) {
    const prefix = url.hash.slice(0, marker + 1);
    const parameters = new URLSearchParams(url.hash.slice(marker + 1));
    for (const name of [...parameters.keys()]) if (allowed(name)) names.add(name);
    for (const name of names) if (parameters.has(name)) parameters.set(name, `{${name}}`);
    url.hash = `${prefix}${parameters}`;
  }
  if (names.size === 0) return undefined;
  let template = url.href;
  for (const name of names) template = template.replaceAll(`%7B${name}%7D`, `{${name}}`);
  return { template, names: [...names] };
}

function generatedToolName(url: string, actionName: string) {
  const domain = new URL(url).hostname.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return `${domain}_${actionName.replace(/-/g, "_")}`;
}

export function prepareGeneratedSkillPackage(value: unknown, sourceUrl: string, existing?: ExistingSkillPackage): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as Partial<GeneratedSkillPackage>).references)) return value;
  const skillPackage = value as GeneratedSkillPackage;
  const route = routeTemplate(sourceUrl);
  const existingTools = new Map(existing?.references.flatMap((reference) => {
    try {
      const action = parseAction(codeBlock(reference.content), reference.filename.replace(/\.md$/, ""));
      return action.toolName ? [[reference.filename, action.toolName] as const] : [];
    } catch { return []; }
  }) ?? []);
  return {
    ...skillPackage,
    references: skillPackage.references.map((reference) => {
      try {
        const source = codeBlock(reference.content);
        const action = JSON.parse(source) as Record<string, any>;
        const actionName = reference.filename.replace(/\.md$/, "");
        action.published = true;
        action.toolName = existingTools.get(reference.filename) || generatedToolName(sourceUrl, actionName);
        if (route && action.scope?.url === sourceUrl && action.inputSchema?.type === "object") {
          action.scope = { ...action.scope, urlTemplate: route.template };
          action.inputSchema.properties = { ...(action.inputSchema.properties || {}) };
          for (const name of route.names) action.inputSchema.properties[name] ??= { type: "string", minLength: 1, maxLength: 256 };
          action.inputSchema.required = [...new Set([...(action.inputSchema.required || []), ...route.names])];
          action.inputSchema.additionalProperties = false;
        }
        return { ...reference, content: reference.content.replace(/```json\s*\n[\s\S]*?```/, `\`\`\`json\n${JSON.stringify(action)}\n\`\`\``) };
      } catch { return reference; }
    })
  };
}

export function validateSkillPackage(value: unknown): GeneratedSkillPackage {
  if (!value || typeof value !== "object") throw new Error("Model response must be an object");
  const result = value as Partial<GeneratedSkillPackage>;
  if (typeof result.skill !== "string" || !/^---\nname: browsing-[^\n]+\ndescription: [^\n]+\n---(?:\n|$)/.test(result.skill)) throw new Error("SKILL.md must start with complete browsing-skills frontmatter");
  if (!Array.isArray(result.references) || result.references.length === 0 || result.references.length > 8) throw new Error("Model must return 1 to 8 action references");
  if (forbiddenText.test(result.skill)) throw new Error("Generated SKILL.md contains a secret or local path");
  const filenames = new Set<string>();
  const publishedTools = new Set<string>();
  const modes = new Set<string>();
  for (const reference of result.references) {
    if (!reference || typeof reference.filename !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(reference.filename)) throw new Error("Reference filename must be kebab-case and end in .md");
    if (filenames.has(reference.filename)) throw new Error("Reference filenames must be unique");
    filenames.add(reference.filename);
    if (typeof reference.content !== "string") throw new Error(`${reference.filename} content is not text`);
    if (!reference.content.startsWith("# ")) throw new Error(`${reference.filename} must start with a Markdown title`);
    if (!/^#{1,3}\s+Action\s*:/mi.test(reference.content)) throw new Error(`${reference.filename} is missing an Action heading`);
    if (forbiddenText.test(reference.content)) throw new Error(`${reference.filename} contains a secret or local path`);
    try {
      const action = parseAction(codeBlock(reference.content), reference.filename.replace(/\.md$/, ""));
      modes.add(action.mode);
      if (action.published) {
        if (!action.toolName) throw new Error("published actions require toolName");
        if (publishedTools.has(action.toolName)) throw new Error(`duplicate published tool name ${action.toolName}`);
        publishedTools.add(action.toolName);
      }
    } catch (error) { throw new Error(`${reference.filename}: ${error instanceof Error ? error.message : "invalid action"}`); }
  }
  if (modes.size > 1) throw new Error("Generated skill package must not mix read and write actions");
  return { skill: result.skill, references: result.references };
}

function actionName(reference: GeneratedReference) {
  return reference.content.match(/^#{1,3}\s+Action\s*:\s*(.+)$/mi)?.[1]?.trim() || reference.filename.replace(/\.md$/, "");
}

function frontmatter(skill: string) {
  const match = skill.match(/^(---\n[\s\S]*?\n---)\n*/);
  return match?.[1] || "---\nname: browsing-site\ndescription: Browse this website.\n---";
}

function skillIndex(skill: string, references: GeneratedReference[]) {
  const name = frontmatter(skill).match(/^name:\s*(.+)$/m)?.[1]?.replace(/^browsing-/, "") || "site";
  return `${frontmatter(skill)}\n\n# ${name} — Browsing Skill\n\nUse this index to choose the action that matches the request, then open only its reference for navigation, requirements, code, and return shape.\n\n## Action Index\n${references.map((reference) => `- **${actionName(reference)}** — Run this action on the matching page. Full spec: [references/${reference.filename}](references/${reference.filename}).`).join("\n")}\n`;
}

export async function loadSkillPackage(domain: string, workspace = process.cwd()): Promise<ExistingSkillPackage | undefined> {
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error("Invalid domain");
  const directory = resolve(workspace, "skills", domain);
  try {
    const skill = await readFile(resolve(directory, "SKILL.md"), "utf8");
    const references = (await readdir(resolve(directory, "references"), { withFileTypes: true }))
      .filter((entry) => entry.isFile() && /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(entry.name))
      .sort((left, right) => left.name.localeCompare(right.name));
    return { directory, skill, references: await Promise.all(references.map(async (entry) => ({ filename: entry.name, content: await readFile(resolve(directory, "references", entry.name), "utf8") }))) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
}

export function mergeSkillPackages(existing: ExistingSkillPackage | undefined, delta: GeneratedSkillPackage): { skillPackage: GeneratedSkillPackage; added: string[]; updated: string[] } {
  const prior = new Map(existing?.references.map((reference) => [reference.filename, reference]) ?? []);
  const added: string[] = [];
  const updated: string[] = [];
  for (const reference of delta.references) {
    (prior.has(reference.filename) ? updated : added).push(reference.filename.replace(/\.md$/, ""));
    prior.set(reference.filename, reference);
  }
  const references = [...prior.values()].sort((left, right) => left.filename.localeCompare(right.filename));
  return { skillPackage: { skill: skillIndex(existing?.skill || delta.skill, references), references }, added, updated };
}

export async function writeSkillPackage(domain: string, skillPackage: GeneratedSkillPackage, workspace = process.cwd()) {
  if (!/^[a-z0-9.-]+$/i.test(domain)) throw new Error("Invalid domain");
  const directory = resolve(workspace, "skills", domain);
  const referenceDirectory = resolve(directory, "references");
  await mkdir(referenceDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(directory, "SKILL.md"), skillPackage.skill.trimEnd() + "\n"),
    ...skillPackage.references.map((reference) => writeFile(resolve(referenceDirectory, reference.filename), reference.content.trimEnd() + "\n"))
  ]);
  return { directory, actions: skillPackage.references.map((reference) => reference.filename.replace(/\.md$/, "")) };
}
