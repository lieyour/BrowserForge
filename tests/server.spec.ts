import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import { exploreForm } from "../src/explorer/exploreForm.js";
import { writeSkillPackage } from "../src/generator/skillPackage.js";
import { createBrowserForgeServer } from "../src/server.js";

function readReference(action: string) {
  const contract = { name: action, mode: "read", toolName: `example_${action.replace(/-/g, "_")}`, scope: { origin: "https://example.test", url: `https://example.test/${action}` }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { rows: { type: "array" } }, required: ["rows"] }, maxOutputChars: 500, plan: { version: 1, rootSelector: `[data-module=${action}]`, collection: { selector: "[data-rows]", rowSelector: "[data-row]" }, fields: { value: { selector: "[data-value]" } }, dedupeBy: "value", output: { key: "rows", fields: { value: "value" } } } };
  return `# ${action}\n\n## Action: ${action}\n\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n`;
}

function writeReference(action: string) {
  const contract = {
    name: action, mode: "write", operation: "create", toolName: `example_${action.replace(/-/g, "_")}`,
    scope: { origin: "https://example.test", url: `https://example.test/${action}` },
    inputSchema: { type: "object", properties: { item: { type: "string" } }, required: ["item"], additionalProperties: false },
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
    maxOutputChars: 500,
    plan: { version: 1, fields: { item: { selector: '[data-testid="item"]', kind: "fill" } }, submitSelector: '[data-testid="submit"]', successSelector: '[data-testid="success"]', failureSelector: '[data-testid="failure"]', timeoutMs: 500, confirmText: "Create item?" }
  };
  return `# ${action}\n\n## Action: ${action}\n\n\`\`\`json\n${JSON.stringify(contract)}\n\`\`\`\n`;
}

function closeServer(server: ReturnType<typeof createBrowserForgeServer>) {
  return new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

function callServer(port: number, method: string, path: string, body?: unknown, origin?: string) {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const client = request({ host: "127.0.0.1", port, method, path, headers: { ...(payload ? { "content-type": "application/json", "content-length": Buffer.byteLength(payload) } : {}), ...(origin ? { origin } : {}), connection: "close" } }, (response) => {
      let text = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { text += chunk; });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(text) }));
    });
    client.on("error", reject);
    client.end(payload);
  });
}

async function runThroughBridge(port: number, body: Record<string, unknown>, expectedType = "run-read-action", data: unknown = { rows: [{ value: "ok" }] }) {
  await callServer(port, "POST", "/api/bridge/poll", {}, "chrome-extension://test-extension");
  const running = callServer(port, "POST", "/api/actions/run", body);
  let command: any;
  await expect.poll(async () => {
    const polled = await callServer(port, "POST", "/api/bridge/poll", {}, "chrome-extension://test-extension");
    command = polled.body;
    return command.type;
  }).toBe(expectedType);
  await callServer(port, "POST", "/api/bridge/result", { taskId: command.taskId, ok: true, durationMs: 12, data }, "chrome-extension://test-extension");
  return { command, response: await running };
}

test("extension API compiles a current-tab semantic snapshot", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-service-"));
  const server = createBrowserForgeServer(workspace);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const exploration = await exploreForm(pathToFileURL(resolve("fixtures/form.html")).href);
    exploration.sourceUrl = "https://example.test/student-form";
    exploration.origin = "https://example.test";
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const response = await callServer(address.port, "POST", "/api/compile", exploration, "chrome-extension://test-extension");
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true, skill: { name: "fill-student-form", fields: 8 } });
  } finally {
    await closeServer(server);
  }
});

test("service rejects calls that do not originate from the extension", async () => {
  const server = createBrowserForgeServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const response = await callServer(address.port, "POST", "/api/compile");
    expect(response.status).toBe(403);
  } finally {
    await closeServer(server);
  }
});

test("lists v1 actions and fails fast when the extension bridge is disconnected", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-actions-"));
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example-test\ndescription: Example.\n---\n", references: [{ filename: "search.md", content: readReference("search") }] }, workspace);
  const server = createBrowserForgeServer(workspace);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    await expect(callServer(address.port, "GET", "/api/actions?domain=example.test")).resolves.toMatchObject({ status: 200, body: { actions: [{ name: "search", runnable: true, mode: "read" }] } });
    await expect(callServer(address.port, "POST", "/api/actions/run", { domain: "example.test", action: "search", input: {} })).resolves.toMatchObject({ status: 503, body: { ok: false, error: expect.stringContaining("not connected") } });
  } finally {
    await closeServer(server);
  }
});

test("named and generic calls enqueue the same validated bridge action", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-named-actions-"));
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example-test\ndescription: Example.\n---\n", references: [{ filename: "search.md", content: readReference("search") }] }, workspace);
  const server = createBrowserForgeServer(workspace);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const generic = await runThroughBridge(address.port, { domain: "example.test", action: "search", input: {} });
    const named = await runThroughBridge(address.port, { domain: "example.test", action: "search", input: {}, toolName: "example_search" });
    expect(named.command.action).toEqual(generic.command.action);
    expect(generic.response.body).toMatchObject({ ok: true, invocation: { tool: "browserforge_run_read_action", domain: "example.test", action: "search", actionDurationMs: 12, bridgeWaitMs: expect.any(Number) } });
    expect(named.response.body).toMatchObject({ ok: true, invocation: { tool: "example_search", domain: "example.test", action: "search", actionDurationMs: 12, bridgeWaitMs: expect.any(Number) } });
  } finally {
    await closeServer(server);
  }
});

test("service lists and routes write actions while enforcing the expected mode", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-write-actions-"));
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example-test\ndescription: Example.\n---\n", references: [{ filename: "create-item.md", content: writeReference("create-item") }] }, workspace);
  const server = createBrowserForgeServer(workspace);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    await expect(callServer(address.port, "GET", "/api/actions?domain=example.test")).resolves.toMatchObject({ status: 200, body: { actions: [{ name: "create-item", runnable: true, mode: "write", risk: "write" }] } });
    await expect(callServer(address.port, "POST", "/api/actions/run", { domain: "example.test", action: "create-item", mode: "read", input: { item: "demo" } })).resolves.toMatchObject({ status: 400, body: { error: expect.stringContaining("mode mismatch") } });
    const result = await runThroughBridge(address.port, { domain: "example.test", action: "create-item", mode: "write", input: { item: "demo" } }, "run-write-action", { submitted: true, operation: "create", state: "SUCCESS" });
    expect(result.command).toMatchObject({ type: "run-write-action", action: { mode: "write", operation: "create", plan: { submitSelector: '[data-testid="submit"]' } }, input: { item: "demo" } });
    expect(result.response.body).toMatchObject({ ok: true, invocation: { tool: "browserforge_run_write_action", action: "create-item" }, data: { state: "SUCCESS" } });
  } finally {
    await closeServer(server);
  }
});

test("AI endpoint writes browsing-skills files from a validated model package", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-ai-"));
  const packageFromModel = {
    skill: "---\nname: browsing-example-test\ndescription: Use when searching Example Test.\n---\n\n# Example Test\n\n## Action Index\n- **search** — Search. Full spec: [references/search.md](references/search.md).\n",
    references: [{ filename: "search.md", content: readReference("search") }]
  };
  const server = createBrowserForgeServer(workspace, async () => packageFromModel);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const response = await callServer(address.port, "POST", "/api/generate", { url: "https://example.test/search", title: "Example", visibleText: "Search", elements: [] }, "chrome-extension://test-extension");
    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({ ok: true, skill: { actions: ["search"] } });
  } finally {
    await closeServer(server);
  }
});

test("AI endpoint validates and forwards the requested generation mode", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-generation-mode-"));
  let observedMode: string | undefined;
  const packageFromModel = {
    skill: "---\nname: browsing-example-test\ndescription: Example.\n---\n",
    references: [{ filename: "search.md", content: readReference("search") }]
  };
  const server = createBrowserForgeServer(workspace, async (snapshot) => { observedMode = snapshot.generationMode; return packageFromModel; });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const snapshot = { url: "https://example.test/search", title: "Example", visibleText: "Search", elements: [], generationMode: "write" };
    await expect(callServer(address.port, "POST", "/api/generate", snapshot, "chrome-extension://test-extension")).resolves.toMatchObject({ status: 201 });
    expect(observedMode).toBe("write");
    await expect(callServer(address.port, "POST", "/api/generate", { ...snapshot, generationMode: "invalid" }, "chrome-extension://test-extension")).resolves.toMatchObject({ status: 400, body: { error: "Invalid page snapshot" } });
  } finally {
    await closeServer(server);
  }
});

test("AI endpoint preserves existing actions and merges a same-domain page action", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-merge-"));
  const actionPackage = (action: string) => ({
    skill: "---\nname: browsing-example-test\ndescription: Use when browsing Example Test.\n---\n\n# Example Test\n\n## Action Index\n",
    references: [{ filename: `${action}.md`, content: readReference(action) }]
  });
  let calls = 0;
  const server = createBrowserForgeServer(workspace, async () => actionPackage(calls++ === 0 ? "overview" : "issues"));
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test server did not bind a TCP port");
    const snapshot = { url: "https://example.test/page", title: "Example", visibleText: "Page", elements: [] };
    await callServer(address.port, "POST", "/api/generate", snapshot, "chrome-extension://test-extension");
    const second = await callServer(address.port, "POST", "/api/generate", { ...snapshot, url: "https://example.test/issues" }, "chrome-extension://test-extension");
    expect(second.body).toMatchObject({ ok: true, skill: { mode: "extended", added: ["issues"], actions: ["issues", "overview"] } });
    await expect(readFile(resolve(workspace, "skills", "example.test", "references", "overview.md"), "utf8")).resolves.toContain("## Action: overview");
    await expect(readFile(resolve(workspace, "skills", "example.test", "SKILL.md"), "utf8")).resolves.toContain("references/issues.md");
  } finally {
    await closeServer(server);
  }
});
