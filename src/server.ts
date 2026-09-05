import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { compileSkill } from "./compiler/skillCompiler.js";
import type { FormExploration } from "./contracts/skill.js";
import { generateSkillWithResponses, type PageSnapshot } from "./generator/responsesClient.js";
import { exploreSiteFlow, flowLimits } from "./generator/flowExplorer.js";
import { loadSkillPackage, mergeSkillPackages, validateSkillPackage, writeSkillPackage, type ExistingSkillPackage } from "./generator/skillPackage.js";

const bodyLimit = 5_000_000;

function send(response: ServerResponse, status: number, body: unknown, origin?: string) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    ...(origin?.startsWith("chrome-extension://") ? { "access-control-allow-origin": origin, vary: "Origin" } : {})
  });
  response.end(JSON.stringify(body));
}

function extensionOrigin(request: IncomingMessage) {
  const origin = request.headers.origin;
  return typeof origin === "string" && origin.startsWith("chrome-extension://") ? origin : undefined;
}

function isLocator(value: unknown): value is { strategy: string; value: string } {
  return !!value && typeof value === "object" && typeof (value as Record<string, unknown>).strategy === "string" && typeof (value as Record<string, unknown>).value === "string";
}

function isExploration(value: unknown): value is FormExploration {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FormExploration>;
  if (typeof item.sourceUrl !== "string" || typeof item.title !== "string" || !Array.isArray(item.fields) || !item.submit || !Array.isArray(item.successEvidence)) return false;
  try {
    const url = new URL(item.sourceUrl);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname) return false;
  } catch { return false; }
  return item.fields.every((field) => !!field && typeof field.name === "string" && typeof field.label === "string" && typeof field.kind === "string" && typeof field.required === "boolean" && Array.isArray(field.locators) && field.locators.every(isLocator))
    && Array.isArray(item.submit.locators) && item.submit.locators.every(isLocator)
    && item.successEvidence.every(isLocator);
}

async function requestJson(request: IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > bodyLimit) throw new Error("Request body exceeds 1 MB");
  }
  return JSON.parse(body);
}

function isSnapshot(value: unknown): value is PageSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PageSnapshot>;
  if (typeof snapshot.url !== "string" || typeof snapshot.title !== "string" || typeof snapshot.visibleText !== "string" || !Array.isArray(snapshot.elements)) return false;
  try {
    const url = new URL(snapshot.url);
    if (!["http:", "https:"].includes(url.protocol)) return false;
  } catch { return false; }
  return snapshot.visibleText.length <= 20_000 && snapshot.elements.length <= 300 && (!snapshot.screenshot || (typeof snapshot.screenshot === "string" && snapshot.screenshot.startsWith("data:image/jpeg;base64,") && snapshot.screenshot.length <= 4_000_000));
}

function isFlowRequest(value: unknown): value is { startUrl: string } {
  if (!value || typeof value !== "object" || typeof (value as { startUrl?: unknown }).startUrl !== "string") return false;
  try { return ["http:", "https:"].includes(new URL((value as { startUrl: string }).startUrl).protocol); } catch { return false; }
}

export type SkillRecognizer = (snapshot: PageSnapshot, existing?: ExistingSkillPackage) => Promise<unknown>;

export function createBrowserForgeServer(workspace = process.cwd(), recognize: SkillRecognizer = generateSkillWithResponses) {
  return createServer(async (request, response) => {
    const origin = extensionOrigin(request);
    const requestPath = request.url ?? "";
    if (request.method === "OPTIONS") {
      response.writeHead(204, origin ? { "access-control-allow-origin": origin, "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "content-type", vary: "Origin" } : {});
      response.end();
      return;
    }
    if (request.method === "GET" && requestPath === "/health") return send(response, 200, { ok: true }, origin);
    if (request.method !== "POST" || !["/api/compile", "/api/generate", "/api/generate-flow"].includes(requestPath)) return send(response, 404, { error: "Not found" }, origin);
    if (!origin) return send(response, 403, { error: "Only the BrowserForge extension may call this endpoint" });
    try {
      const body = await requestJson(request);
      if (requestPath === "/api/generate-flow") {
        if (!isFlowRequest(body)) return send(response, 400, { error: "Invalid flow start URL" }, origin);
        const domain = new URL(body.startUrl).hostname;
        const flow = await exploreSiteFlow(body.startUrl);
        if (!flow.pages.length) return send(response, 400, { error: "No readable same-domain pages were found", flow: { visited: 0, skipped: flow.skipped } }, origin);
        const added = new Set<string>();
        const updated = new Set<string>();
        for (const snapshot of flow.pages) {
          try {
            const existing = await loadSkillPackage(domain, workspace);
            const generated = validateSkillPackage(await recognize(snapshot, existing));
            const merged = mergeSkillPackages(existing, generated);
            await writeSkillPackage(domain, merged.skillPackage, workspace);
            merged.added.forEach((action) => added.add(action));
            merged.updated.forEach((action) => updated.add(action));
          } catch (error) {
            flow.skipped.push({ url: snapshot.url, reason: `generation: ${error instanceof Error ? error.message.slice(0, 180) : "failed"}` });
          }
        }
        const location = await loadSkillPackage(domain, workspace);
        return send(response, 201, { ok: true, skill: { directory: location?.directory, actions: location?.references.map((reference) => reference.filename.replace(/\.md$/, "")) ?? [], added: [...added], updated: [...updated], mode: "flow" }, flow: { visited: flow.pages.length, limits: { pages: flowLimits.maxPages, depth: flowLimits.maxDepth, durationMs: flowLimits.timeoutMs }, skipped: flow.skipped } }, origin);
      }
      if (requestPath === "/api/generate") {
        if (!isSnapshot(body)) return send(response, 400, { error: "Invalid page snapshot" }, origin);
        const domain = new URL(body.url).hostname;
        const existing = await loadSkillPackage(domain, workspace);
        const generated = validateSkillPackage(await recognize(body, existing));
        const merged = mergeSkillPackages(existing, generated);
        const location = await writeSkillPackage(domain, merged.skillPackage, workspace);
        return send(response, 201, { ok: true, skill: { directory: location.directory, actions: location.actions, added: merged.added, updated: merged.updated, mode: existing ? "extended" : "created" } }, origin);
      }
      if (!isExploration(body)) return send(response, 400, { error: "Invalid form exploration payload" }, origin);
      const source = new URL(body.sourceUrl);
      const exploration: FormExploration = { ...body, origin: source.origin, risk: "write" };
      const generated = await compileSkill(exploration, resolve(workspace, "skills", source.hostname));
      return send(response, 201, { ok: true, skill: { name: generated.name, directory: generated.directory, fields: exploration.fields.length } }, origin);
    } catch (error) {
      return send(response, 400, { error: error instanceof Error ? error.message : "Could not create skill" }, origin);
    }
  });
}

export function startBrowserForgeServer(port = 8787, workspace = process.cwd()) {
  const server = createBrowserForgeServer(workspace);
  server.listen(port, "127.0.0.1", () => console.log(`BrowserForge service listening at http://127.0.0.1:${port}`));
  return server;
}
