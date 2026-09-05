import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export type GeneratedReference = { filename: string; content: string };
export type GeneratedSkillPackage = { skill: string; references: GeneratedReference[] };
export type ExistingSkillPackage = GeneratedSkillPackage & { directory: string };

const forbiddenText = /(sk-[A-Za-z0-9_-]{12,}|[A-Za-z]:\\|\/Users\/|\/home\/)/;
const forbiddenCode = /(sk-[A-Za-z0-9_-]{12,}|document\.cookie|localStorage\.getItem\s*\(\s*["'](?:token|auth|session)|[A-Za-z]:\\|\/Users\/|\/home\/)/i;

function codeBlocks(markdown: string) {
  return [...markdown.matchAll(/```js\s*\n([\s\S]*?)```/g)].map((match) => match[1]);
}

// The Action heading carries no executable meaning. Add it deterministically when a
// model has produced an otherwise complete browsing-skills reference without it.
export function normalizeSkillPackage(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as Partial<GeneratedSkillPackage>).references)) return value;
  const skillPackage = value as GeneratedSkillPackage;
  return {
    ...skillPackage,
    references: skillPackage.references.map((reference) => {
      if (!reference || typeof reference.content !== "string" || /^#{1,3}\s+Action\s*:/mi.test(reference.content)) return reference;
      const action = typeof reference.filename === "string" ? reference.filename.replace(/\.md$/, "") : "action";
      const heading = `## Action: ${action}\n\n`;
      const title = reference.content.match(/^# [^\n]*\n?/);
      const content = title
        ? `${title[0]}\n${heading}${reference.content.slice(title[0].length)}`
        : `${heading}${reference.content}`;
      return { ...reference, content };
    })
  };
}

export function validateSkillPackage(value: unknown): GeneratedSkillPackage {
  if (!value || typeof value !== "object") throw new Error("Model response must be an object");
  const result = value as Partial<GeneratedSkillPackage>;
  if (typeof result.skill !== "string" || !result.skill.startsWith("---\nname: browsing-")) throw new Error("SKILL.md must start with browsing-skills frontmatter");
  if (!Array.isArray(result.references) || result.references.length === 0 || result.references.length > 8) throw new Error("Model must return 1 to 8 action references");
  if (forbiddenText.test(result.skill)) throw new Error("Generated SKILL.md contains a secret or local path");
  const filenames = new Set<string>();
  for (const reference of result.references) {
    if (!reference || typeof reference.filename !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/.test(reference.filename)) throw new Error("Reference filename must be kebab-case and end in .md");
    if (filenames.has(reference.filename)) throw new Error("Reference filenames must be unique");
    filenames.add(reference.filename);
    if (typeof reference.content !== "string") throw new Error(`${reference.filename} content is not text`);
    if (!/^#{1,3}\s+Action\s*:/mi.test(reference.content)) throw new Error(`${reference.filename} is missing an Action heading`);
    if (forbiddenText.test(reference.content)) throw new Error(`${reference.filename} contains a secret or local path`);
    const blocks = codeBlocks(reference.content);
    if (blocks.length !== 1) throw new Error(`${reference.filename} must contain exactly one JavaScript action block`);
    const code = blocks[0];
    if (forbiddenCode.test(code)) throw new Error(`${reference.filename} action reads sensitive browser data`);
    if (!/\bname\s*:/.test(code) || !/\binputSchema\s*:/.test(code) || !/\bexecute\s*:\s*(?:async\s+)?function\b/.test(code)) throw new Error(`${reference.filename} action lacks name, inputSchema, or execute`);
    if (/\b(?:import|require|let|const)\b/.test(code)) throw new Error(`${reference.filename} action must be self-contained and use var declarations`);
    try { new Function(`return (${code}\n);`); } catch { throw new Error(`${reference.filename} action JavaScript does not compile`); }
  }
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
