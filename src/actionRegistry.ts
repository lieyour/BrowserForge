import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { loadSkillPackage } from "./generator/skillPackage.js";
import type { ReadAction } from "./readAction.js";
import { parseActionReference, type Action } from "./writeAction.js";

export { parseActionReference } from "./writeAction.js";

export type PublishedActionTool = {
  name: string;
  description: string;
  inputSchema: ReadAction["inputSchema"];
  outputSchema: ReadAction["outputSchema"];
  domain: string;
  action: string;
  mode: Action["mode"];
};

export async function locateAction(workspace: string, domain: string, actionName: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(actionName)) throw new Error("Invalid action name");
  const skill = await loadSkillPackage(domain, workspace);
  if (!skill) throw new Error(`Skill ${domain} was not found`);
  const reference = skill.references.find((item) => item.filename === `${actionName}.md`);
  if (!reference) throw new Error(`Action ${actionName} was not found`);
  return { ...parseActionReference(reference.content, actionName), reference };
}

export async function loadPublishedActionTools(workspace = process.cwd()): Promise<PublishedActionTool[]> {
  const skillsDirectory = resolve(workspace, "skills");
  let domains: string[];
  try {
    domains = (await readdir(skillsDirectory, { withFileTypes: true }))
      .filter((entry) => entry.isDirectory() && /^[a-z0-9.-]+$/i.test(entry.name))
      .map((entry) => entry.name)
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
  const tools: PublishedActionTool[] = [];
  const names = new Set<string>();
  for (const domain of domains) {
    const skill = await loadSkillPackage(domain, workspace);
    for (const reference of skill?.references ?? []) {
      const actionName = reference.filename.replace(/\.md$/, "");
      let action: Action;
      try { action = parseActionReference(reference.content, actionName).action; } catch { continue; }
      if (!action.published) continue;
      if (!action.toolName) throw new Error(`Published action ${domain}/${actionName} is missing toolName`);
      if (names.has(action.toolName)) throw new Error(`Duplicate published tool name: ${action.toolName}`);
      names.add(action.toolName);
      tools.push({
        name: action.toolName,
        description: action.description || `Run ${actionName} in the current authenticated ${domain} tab at the exact required route.`,
        inputSchema: action.inputSchema,
        outputSchema: action.outputSchema,
        domain,
        action: actionName,
        mode: action.mode
      });
    }
  }
  return tools.sort((left, right) => left.name.localeCompare(right.name));
}

export function buildRdmsDeploymentUrl(input: Record<string, unknown>) {
  const parameters = new URLSearchParams({
    versionType: "ASM",
    appCode: String(input.appCode),
    appName: String(input.appName),
    sysCode: String(input.sysCode),
    env: String(input.env)
  });
  const url = new URL("https://rdms.dmall.com/");
  url.hash = `index/environment/dmallenv/appdetail:${parameters}`;
  return url.href;
}

export function resolveActionRoute<T extends Action>(action: T, input: Record<string, unknown>): T {
  if (!action.scope.urlTemplate) {
    if (action.toolName !== "rdms_list_deployment_instances") return action;
    return { ...action, scope: { ...action.scope, url: buildRdmsDeploymentUrl(input) } } as T;
  }
  const url = action.scope.urlTemplate.replace(/\{([A-Za-z][A-Za-z0-9_-]{0,63})\}/g, (_placeholder, name: string) => encodeURIComponent(String(input[name])));
  const resolved = new URL(url).href;
  if (new URL(resolved).origin !== action.scope.origin) throw new Error("Resolved action route changed origin");
  return { ...action, scope: { ...action.scope, url: resolved } } as T;
}
