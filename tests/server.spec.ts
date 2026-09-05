import { once } from "node:events";
import { mkdtemp, readFile } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { test, expect } from "@playwright/test";
import { exploreForm } from "../src/explorer/exploreForm.js";
import { createBrowserForgeServer } from "../src/server.js";

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

test("AI endpoint writes browsing-skills files from a validated model package", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-ai-"));
  const packageFromModel = {
    skill: "---\nname: browsing-example-test\ndescription: Use when searching Example Test.\n---\n\n# Example Test\n\n## Action Index\n- **search** — Search. Full spec: [references/search.md](references/search.md).\n",
    references: [{ filename: "search.md", content: "# Search\n\n## Requirements\n\nNone.\n\n## How to run this action\n\nRun it in page context.\n\n---\n\n## Action: search\n\n**Navigate to:** `https://example.test`\n\n**Code:**\n\n```js\n({ name: \"example-search\", description: \"Search.\", inputSchema: { type: \"object\" }, execute: async function(params) { var value = params; return { content: [{ type: \"text\", text: JSON.stringify(value) }] }; } })\n```\n\n**Returns:** `{}`\n" }]
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

test("AI endpoint preserves existing actions and merges a same-domain page action", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-merge-"));
  const actionPackage = (action: string) => ({
    skill: "---\nname: browsing-example-test\ndescription: Use when browsing Example Test.\n---\n\n# Example Test\n\n## Action Index\n",
    references: [{ filename: `${action}.md`, content: `# ${action}\n\n## Requirements\n\nNone.\n\n## How to run this action\n\nRun it in page context.\n\n## Action: ${action}\n\n**Navigate to:** \`https://example.test/${action}\`\n\n**Code:**\n\n\`\`\`js\n({ name: \"example-${action}\", description: \"${action}.\", inputSchema: { type: \"object\" }, execute: async function(params) { var value = params; return { content: [{ type: \"text\", text: JSON.stringify(value) }] }; } })\n\`\`\`\n\n**Returns:** \`{}\`\n` }]
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
