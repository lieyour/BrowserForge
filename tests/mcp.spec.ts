import { mkdtemp } from "node:fs/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { createMcpHandler } from "../src/mcp.js";
import { parseReadActionReference } from "../src/readAction.js";
import { writeSkillPackage } from "../src/generator/skillPackage.js";
import { readFile } from "node:fs/promises";

const call = (name: string, args: Record<string, unknown>) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } });
const rdmsInput = { appCode: "starter-credential", sysCode: "dmall-srm", env: "test", appName: "服务层" };

test("tools/list is deterministic and advertises the published RDMS schemas", async () => {
  const first = await createMcpHandler();
  const second = await createMcpHandler();
  const request = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  const firstResult = await first(request) as any;
  const secondResult = await second(request) as any;
  expect(firstResult).toEqual(secondResult);
  const tools = firstResult.result.tools;
  expect(tools.map((tool: { name: string }) => tool.name)).toEqual([...tools.map((tool: { name: string }) => tool.name)].sort());
  expect(tools).toContainEqual(expect.objectContaining({ name: "browserforge_run_write_action" }));
  const reference = await readFile("skills/rdms.dmall.com/references/list-deployment-instances.md", "utf8");
  const action = parseReadActionReference(reference, "list-deployment-instances").action;
  expect(tools.find((tool: { name: string }) => tool.name === action.toolName)).toMatchObject({ inputSchema: action.inputSchema, outputSchema: action.outputSchema });
});

test("named calls validate locally and route through the existing action endpoint", async () => {
  const requests: Array<{ url: string; body?: string }> = [];
  const mockFetch = async (url: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ url: String(url), body: init?.body as string | undefined });
    return new Response(JSON.stringify({ ok: true, data: { toolVersion: "2", route: "route", count: 0, instances: [] } }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const handle = await createMcpHandler({ fetch: mockFetch as typeof fetch });
  const invalid = await handle(call("rdms_list_deployment_instances", { ...rdmsInput, unexpected: true })) as any;
  expect(invalid.result).toMatchObject({ isError: true, structuredContent: { ok: false, error: expect.stringContaining("unknown field") } });
  expect(requests).toHaveLength(0);

  const valid = await handle(call("rdms_list_deployment_instances", rdmsInput)) as any;
  expect(valid.result).toMatchObject({ structuredContent: { ok: true, data: { toolVersion: "2" } } });
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toContain("/api/actions/run");
  expect(JSON.parse(requests[0].body || "{}")).toEqual({ domain: "rdms.dmall.com", action: "list-deployment-instances", mode: "read", input: rdmsInput, toolName: "rdms_list_deployment_instances" });
});

test("service failures stay MCP result-level structured errors", async () => {
  const handle = await createMcpHandler({ fetch: (async () => new Response(JSON.stringify({ ok: false, error: "BrowserForge extension is not connected" }), { status: 503 })) as typeof fetch });
  const result = await handle(call("rdms_list_deployment_instances", rdmsInput)) as any;
  expect(result.result).toMatchObject({ isError: true, structuredContent: { ok: false, status: 503, error: expect.stringContaining("not connected") } });
  expect(JSON.parse(result.result.content[0].text)).toEqual(result.result.structuredContent);
});

test("registry rejects published tool collisions across skills", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-registry-"));
  const reference = (name: string) => `# ${name}\n\n## Action: ${name}\n\n\`\`\`json\n${JSON.stringify({ name, mode: "read", toolName: "duplicate_tool", published: true, scope: { origin: "https://example.test", url: `https://example.test/${name}` }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { rows: { type: "array" } }, required: ["rows"] }, maxOutputChars: 100, plan: { version: 1, rootSelector: "[data-root]", collection: { selector: "[data-rows]", rowSelector: "[data-row]" }, fields: { value: { selector: "[data-value]" } }, output: { key: "rows", fields: { value: "value" } } } })}\n\`\`\``;
  await writeSkillPackage("one.test", { skill: "---\nname: browsing-one\ndescription: One.\n---", references: [{ filename: "first.md", content: reference("first") }] }, workspace);
  await writeSkillPackage("two.test", { skill: "---\nname: browsing-two\ndescription: Two.\n---", references: [{ filename: "second.md", content: reference("second") }] }, workspace);
  await expect(createMcpHandler({ workspace })).rejects.toThrow("Duplicate published tool name");
});

test("tools/list and tools/call reload newly generated published actions", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-live-registry-"));
  const requests: string[] = [];
  const handle = await createMcpHandler({ workspace, fetch: (async (_url, init) => {
    requests.push(String(init?.body));
    return new Response(JSON.stringify({ ok: true, data: { rows: [] } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch });
  const list = { jsonrpc: "2.0", id: 1, method: "tools/list" };
  expect(JSON.stringify(await handle(list))).not.toContain("example_test_rows");
  const action = { name: "list-rows", description: "List rows.", mode: "read", toolName: "example_test_rows", published: true, scope: { origin: "https://example.test", url: "https://example.test/rows" }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { rows: { type: "array" } }, required: ["rows"] }, maxOutputChars: 100, plan: { version: 1, rootSelector: "[data-root]", collection: { selector: "[data-rows]", rowSelector: "[data-row]" }, fields: { value: { selector: "[data-value]" } }, output: { key: "rows", fields: { value: "value" } } } };
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example\ndescription: Example.\n---", references: [{ filename: "list-rows.md", content: `# List rows\n\n## Action: list-rows\n\n\`\`\`json\n${JSON.stringify(action)}\n\`\`\`` }] }, workspace);
  expect(JSON.stringify(await handle(list))).toContain("example_test_rows");
  const result = await handle(call("example_test_rows", {})) as any;
  expect(result.result).toMatchObject({ structuredContent: { ok: true, data: { rows: [] } } });
  expect(JSON.parse(requests[0])).toMatchObject({ domain: "example.test", action: "list-rows", mode: "read", toolName: "example_test_rows" });
});

test("generic and named write tools advertise schemas without routing metadata and send mode write", async () => {
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-write-registry-"));
  const action = {
    name: "create-item", description: "Create an item.", mode: "write", operation: "create", toolName: "example_test_create_item", published: true,
    scope: { origin: "https://example.test", url: "https://example.test/items/new" },
    inputSchema: { type: "object", properties: { item: { type: "string" } }, required: ["item"], additionalProperties: false },
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
    maxOutputChars: 500,
    plan: { version: 1, fields: { item: { selector: '[data-testid="item"]', kind: "fill" } }, submitSelector: '[data-testid="submit"]', successSelector: '[data-testid="success"]', failureSelector: '[data-testid="failure"]', timeoutMs: 500, confirmText: "Create item?" }
  };
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example\ndescription: Example.\n---", references: [{ filename: "create-item.md", content: `# Create item\n\n## Action: create-item\n\n\`\`\`json\n${JSON.stringify(action)}\n\`\`\`` }] }, workspace);
  const requests: Array<Record<string, unknown>> = [];
  const handle = await createMcpHandler({ workspace, fetch: (async (_url, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ ok: true, data: { submitted: true, operation: "create", state: "SUCCESS" } }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch });
  const listed = await handle({ jsonrpc: "2.0", id: 1, method: "tools/list" }) as any;
  const named = listed.result.tools.filter((tool: { name: string }) => tool.name === "example_test_create_item");
  expect(named).toHaveLength(1);
  expect(named[0]).toMatchObject({ inputSchema: action.inputSchema, outputSchema: action.outputSchema });
  expect(named[0]).not.toHaveProperty("domain");
  expect(named[0]).not.toHaveProperty("action");
  expect(named[0]).not.toHaveProperty("mode");

  await handle(call("browserforge_run_write_action", { domain: "example.test", action: "create-item", input: { item: "generic" } }));
  await handle(call("example_test_create_item", { item: "named" }));
  expect(requests).toEqual([
    { domain: "example.test", action: "create-item", mode: "write", input: { item: "generic" } },
    { domain: "example.test", action: "create-item", mode: "write", input: { item: "named" }, toolName: "example_test_create_item" }
  ]);
});

test("silent MCP package command keeps stdout JSON-RPC clean", async () => {
  if (!process.env.npm_execpath) throw new Error("npm_execpath is unavailable");
  const child = spawn(process.execPath, [process.env.npm_execpath, "run", "--silent", "mcp"], { cwd: process.cwd(), stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdin.end('{"jsonrpc":"2.0","id":1,"method":"tools/list"}\n');
  const exitCode = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); });
  expect(exitCode, stderr).toBe(0);
  const lines = stdout.trim().split(/\r?\n/).filter(Boolean);
  expect(lines).toHaveLength(1);
  expect(JSON.parse(lines[0])).toMatchObject({ jsonrpc: "2.0", id: 1, result: { tools: expect.any(Array) } });
});
