import { access, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ActionManifest } from "../contracts/skill.js";

export type LoadedSkill = {
  directory: string;
  manifest: ActionManifest;
  action: (context: ActionContext) => Promise<unknown>;
};

export type ActionContext = {
  page: import("playwright").Page;
  input: Record<string, unknown>;
  helpers: Record<string, (...args: any[]) => Promise<any>>;
};

export async function loadSkill(directory: string, actionName: string): Promise<LoadedSkill> {
  const root = resolve(directory);
  const manifestPath = resolve(root, "manifest.json");
  const actionPath = resolve(root, "actions", `${actionName}.js`);
  if (!manifestPath.startsWith(root) || !actionPath.startsWith(root)) throw new Error("Invalid skill path");
  await Promise.all([access(manifestPath), access(actionPath)]);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as ActionManifest;
  if (manifest.name !== actionName) throw new Error(`Action ${actionName} does not match manifest`);
  // Actions are standalone ESM source. Importing from a data URL avoids relying on
  // the generated directory's nearest package.json (skills can live outside this repo).
  const actionSource = await readFile(actionPath, "utf8");
  const module = await import(`data:text/javascript;base64,${Buffer.from(actionSource).toString("base64")}`) as { default?: LoadedSkill["action"] };
  if (typeof module.default !== "function") throw new Error("Action module must export a default function");
  return { directory: root, manifest, action: module.default };
}
