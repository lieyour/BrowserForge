import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { FormExploration, FormField, JsonSchema } from "../contracts/skill.js";
import { validateGeneratedSkill } from "./validators.js";

function schemaFor(fields: FormField[]): JsonSchema {
  return {
    type: "object",
    properties: Object.fromEntries(fields.map((field) => [field.name, {
      type: field.kind === "checkbox" && field.options && field.options.length > 1 ? "array" : "string",
      ...(field.options ? { enum: field.options } : {}),
      ...(field.kind === "checkbox" && field.options && field.options.length > 1 ? { items: { type: "string" } } : {})
    }])),
    required: fields.filter((field) => field.required).map((field) => field.name),
    additionalProperties: false
  };
}

function actionName(exploration: FormExploration) {
  return `fill-${exploration.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "form"}`;
}

function actionSource(exploration: FormExploration) {
  const fields = JSON.stringify(exploration.fields, null, 2);
  const submit = JSON.stringify(exploration.submit, null, 2);
  const evidence = JSON.stringify(exploration.successEvidence, null, 2);
  return `const fields = ${fields};
const submit = ${submit};
const successEvidence = ${evidence};

export default async function run({ input, helpers }) {
  for (const field of fields) {
    const value = input[field.name];
    if (value === undefined) continue;
    if (field.kind === "radio" || field.kind === "checkbox") await helpers.choose(field, value);
    else await helpers.fill(field, value);
  }
  await helpers.submit(submit);
  await helpers.confirm(successEvidence);
  return { submitted: true };
}
`;
}

function skillMarkdown(name: string, exploration: FormExploration, url: string): string {
  return `# ${name}\n\n填写并提交 ${exploration.title}。\n\n- 风险：write\n- URL：${url}\n- 输入字段：${exploration.fields.map((field) => `\`${field.name}\``).join(", ")}\n- 成功证据：${exploration.successEvidence.map((item) => `${item.strategy}:${item.value}`).join(", ")}\n`;
}

function navigationUrl(sourceUrl: string) {
  return new URL(sourceUrl).protocol === "file:" ? "browserforge-fixture://local-form" : sourceUrl;
}

export async function compileSkill(exploration: FormExploration, outputDirectory: string) {
  const name = actionName(exploration);
  const url = navigationUrl(exploration.sourceUrl);
  const root = resolve(outputDirectory);
  await mkdir(resolve(root, "actions"), { recursive: true });
  await mkdir(resolve(root, "references"), { recursive: true });
  const manifest = {
    name, site: exploration.origin, version: "1.0.0", inputSchema: schemaFor(exploration.fields),
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" } }, required: ["submitted"] },
    risk: "write" as const, navigation: { url }, generatedAt: new Date().toISOString(), supportsRuntime: "browserforge-mvp"
  };
  await Promise.all([
    writeFile(resolve(root, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`),
    writeFile(resolve(root, "actions", `${name}.js`), actionSource(exploration)),
    writeFile(resolve(root, "SKILL.md"), skillMarkdown(name, exploration, url)),
    writeFile(resolve(root, "references", `${name}.md`), `# ${name}\n\n${JSON.stringify({ inputSchema: manifest.inputSchema, outputSchema: manifest.outputSchema, risk: manifest.risk, successEvidence: exploration.successEvidence }, null, 2)}\n`)
  ]);
  await validateGeneratedSkill(root);
  return { name, directory: root, manifest };
}
