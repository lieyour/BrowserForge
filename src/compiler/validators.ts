import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ActionManifest } from "../contracts/skill.js";

export async function validateGeneratedSkill(directory: string): Promise<void> {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as ActionManifest;
  if (!manifest.name || !manifest.navigation?.url || !manifest.inputSchema?.required?.length) throw new Error("Generated manifest is incomplete");
  if (!manifest.outputSchema || manifest.risk !== "write") throw new Error("Generated manifest has invalid output schema or risk");
  const source = await readFile(resolve(directory, "actions", `${manifest.name}.js`), "utf8");
  if (!source.includes("export default")) throw new Error("Generated action has no default export");
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(source)) throw new Error("Generated action contains an absolute local path");
  if (/([A-Za-z]:\\|\/Users\/|\/home\/)/.test(JSON.stringify(manifest))) throw new Error("Generated manifest contains an absolute local path");
}
