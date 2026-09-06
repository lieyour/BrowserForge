import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { generateSkillWithResponses } from "../src/generator/responsesClient.js";
import { validateSkillPackage, writeSkillPackage } from "../src/generator/skillPackage.js";
import { parseReadActionReference } from "../src/readAction.js";
import { resolveActionRoute } from "../src/actionRegistry.js";
import { createMcpHandler } from "../src/mcp.js";

function routeInput(url: string) {
  const parsed = new URL(url);
  const values = Object.fromEntries(parsed.searchParams);
  const marker = Math.max(parsed.hash.lastIndexOf("?"), parsed.hash.lastIndexOf(":"));
  if (marker >= 0 && parsed.hash.slice(marker + 1).includes("=")) Object.assign(values, Object.fromEntries(new URLSearchParams(parsed.hash.slice(marker + 1))));
  return values;
}

const targetUrl = process.argv[2];
if (!targetUrl) throw new Error('Usage: npm run test:generated-skill -- "https://example.com/page"');
const parsedUrl = new URL(targetUrl);
if (!["http:", "https:"].includes(parsedUrl.protocol)) throw new Error("The evaluation URL must use HTTP(S)");

const profile = resolve(process.env.BROWSERFORGE_EVAL_PROFILE || ".playwright-mcp/rdms-profile");
const extension = resolve("extension");
const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-generated-eval-"));
const context = await chromium.launchPersistentContext(profile, {
  channel: "chromium",
  headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});

try {
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(5_000);
  const snapshot = await worker.evaluate(async () => {
    const [current] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!current?.id) throw new Error("No active test tab");
    await chrome.scripting.executeScript({ target: { tabId: current.id }, files: ["content.js"] });
    return chrome.tabs.sendMessage(current.id, { type: "BROWSING_SKILLS_SNAPSHOT" });
  });
  if (!snapshot || snapshot.url !== page.url()) throw new Error("BrowserForge did not capture the active test page");

  const generated = validateSkillPackage(await generateSkillWithResponses(snapshot));
  const location = await writeSkillPackage(parsedUrl.hostname, generated, workspace);
  const actions = new Map(generated.references.map((reference) => {
    const actionName = reference.filename.replace(/\.md$/, "");
    const action = parseReadActionReference(reference.content, actionName).action;
    if (!action.toolName || !action.published) throw new Error(`${actionName} was not published as an MCP tool`);
    return [action.toolName, action] as const;
  }));
  const inputs = routeInput(snapshot.url);
  const mcp = await createMcpHandler({ workspace, fetch: (async (_url, init) => {
    const request = JSON.parse(String(init?.body)) as { action: string; input: Record<string, unknown>; toolName: string };
    const action = actions.get(request.toolName);
    if (!action || action.name !== request.action) return new Response(JSON.stringify({ ok: false, error: "MCP routed to the wrong generated action" }), { status: 400 });
    const resolved = resolveActionRoute(action, request.input);
    const result = await worker.evaluate(async ({ action, input }) => {
      const [current] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      if (!current?.id) throw new Error("No active test tab");
      await chrome.scripting.executeScript({ target: { tabId: current.id }, files: ["content.js"] });
      return chrome.tabs.sendMessage(current.id, { type: "BROWSERFORGE_RUN_READ_ACTION", command: { type: "run-read-action", taskId: crypto.randomUUID(), action, input } });
    }, { action: resolved, input: request.input });
    return new Response(JSON.stringify(result?.ok ? { ok: true, data: result.data, durationMs: result.durationMs } : { ok: false, error: result?.error?.message || "Browser action failed", code: result?.error?.code }), { status: result?.ok ? 200 : 400, headers: { "content-type": "application/json" } });
  }) as typeof fetch });
  const listed = await mcp({ jsonrpc: "2.0", id: 1, method: "tools/list" }) as any;
  const listedNames = new Set(listed.result.tools.map((tool: { name: string }) => tool.name));
  const results = [];
  for (const [toolName, action] of actions) {
    if (!listedNames.has(toolName)) throw new Error(`${toolName} was not returned by MCP tools/list`);
    const required = action.inputSchema.required ?? [];
    const input = Object.fromEntries(required.map((name) => {
      if (inputs[name] === undefined) throw new Error(`${toolName} requires input ${name}, which is not present in the current URL`);
      return [name, inputs[name]];
    }));
    const response = await mcp({ jsonrpc: "2.0", id: results.length + 2, method: "tools/call", params: { name: toolName, arguments: input } }) as any;
    if (response.result?.isError) throw new Error(`${toolName} failed through MCP: ${JSON.stringify(response.result.structuredContent)}`);
    const data = response.result.structuredContent.data;
    const output = data?.[action.plan.output.key];
    results.push({ tool: toolName, action: action.name, outputKey: action.plan.output.key, count: Array.isArray(output) ? output.length : undefined });
  }
  console.log(JSON.stringify({ ok: true, model: process.env.BROWSERFORGE_MODEL || "gpt-5.6-terra", url: snapshot.url, directory: location.directory, actions: results }, null, 2));
} finally {
  await context.close();
}
