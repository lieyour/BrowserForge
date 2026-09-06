import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { watch } from "node:fs";
import { resolve } from "node:path";
import { loadPublishedActionTools, type PublishedActionTool } from "./actionRegistry.js";
import { validateActionInput } from "./readAction.js";

type JsonRpcRequest = { jsonrpc?: string; id?: string | number; method?: string; params?: Record<string, unknown> };
type Fetch = typeof fetch;

const genericTools = [
  {
    name: "browserforge_list_actions",
    description: "Advanced/internal BrowserForge tool: list actions for a domain and whether each reference is runnable.",
    inputSchema: { type: "object" as const, properties: { domain: { type: "string" as const } }, required: ["domain"], additionalProperties: false }
  },
  {
    name: "browserforge_run_read_action",
    description: "Advanced/internal BrowserForge tool: run a declared read action in the current Chrome tab at its exact scope URL.",
    inputSchema: { type: "object" as const, properties: { domain: { type: "string" as const }, action: { type: "string" as const }, input: { type: "object" as const } }, required: ["domain", "action", "input"], additionalProperties: false }
  },
  {
    name: "browserforge_run_write_action",
    description: "Demo-only BrowserForge tool: run a declared write action in the current Chrome tab after one confirmation and one final click.",
    inputSchema: { type: "object" as const, properties: { domain: { type: "string" as const }, action: { type: "string" as const }, input: { type: "object" as const } }, required: ["domain", "action", "input"], additionalProperties: false }
  }
];

class ServiceError extends Error {
  constructor(readonly detail: Record<string, unknown>) { super(typeof detail.error === "string" ? detail.error : "BrowserForge service failed"); }
}

function rpcResponse(id: JsonRpcRequest["id"], result: unknown) { return { jsonrpc: "2.0", id, result }; }
function rpcFailure(id: JsonRpcRequest["id"], code: number, message: string) { return { jsonrpc: "2.0", id: id ?? null, error: { code, message } }; }
function toolResult(value: unknown, isError = false) {
  return { content: [{ type: "text", text: JSON.stringify(value) }], structuredContent: value, ...(isError ? { isError: true } : {}) };
}

export async function createMcpHandler(options: { workspace?: string; serviceUrl?: string; fetch?: Fetch } = {}) {
  const serviceUrl = options.serviceUrl || process.env.BROWSERFORGE_SERVICE_URL || "http://127.0.0.1:8787";
  const fetchService = options.fetch || fetch;
  await loadPublishedActionTools(options.workspace);

  async function publishedTools() { return loadPublishedActionTools(options.workspace); }

  async function service(path: string, init?: RequestInit) {
    const response = await fetchService(new URL(path, serviceUrl), init);
    const body = await response.json() as Record<string, unknown>;
    if (!response.ok) throw new ServiceError({ ...body, status: response.status });
    return body;
  }

  async function namedCall(tool: PublishedActionTool, args: Record<string, unknown>) {
    const input = validateActionInput(tool.inputSchema, args);
    return service("/api/actions/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: tool.domain, action: tool.action, mode: tool.mode, input, toolName: tool.name }) });
  }

  async function callTool(name: string, args: Record<string, unknown>) {
    const named = (await publishedTools()).find((tool) => tool.name === name);
    if (named) return namedCall(named, args);
    if (name === "browserforge_list_actions") {
      if (typeof args.domain !== "string") throw new Error("domain is required");
      return service(`/api/actions?domain=${encodeURIComponent(args.domain)}`);
    }
    if (name === "browserforge_run_read_action") {
      if (typeof args.domain !== "string" || typeof args.action !== "string" || !("input" in args)) throw new Error("domain, action, and input are required");
      return service("/api/actions/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: args.domain, action: args.action, mode: "read", input: args.input }) });
    }
    if (name === "browserforge_run_write_action") {
      if (typeof args.domain !== "string" || typeof args.action !== "string" || !("input" in args)) throw new Error("domain, action, and input are required");
      return service("/api/actions/run", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ domain: args.domain, action: args.action, mode: "write", input: args.input }) });
    }
    throw new Error(`Unknown tool: ${name}`);
  }

  return async function handle(request: JsonRpcRequest) {
    if (request.jsonrpc !== "2.0" || typeof request.method !== "string") return rpcFailure(request.id, -32600, "Invalid JSON-RPC request");
    if (request.method === "initialize") return rpcResponse(request.id, { protocolVersion: "2025-06-18", capabilities: { tools: { listChanged: true } }, serverInfo: { name: "browserforge", version: "1.0.0" } });
    if (request.method === "notifications/initialized") return undefined;
    if (request.method === "ping") return rpcResponse(request.id, {});
    if (request.method === "tools/list") {
      const published = await publishedTools();
      const advertised = [...genericTools, ...published.map(({ domain: _domain, action: _action, mode: _mode, ...tool }) => tool)]
        .sort((left, right) => left.name.localeCompare(right.name));
      return rpcResponse(request.id, { tools: advertised });
    }
    if (request.method === "tools/call") {
      const name = request.params?.name;
      const args = request.params?.arguments;
      if (typeof name !== "string" || !args || typeof args !== "object" || Array.isArray(args)) return rpcFailure(request.id, -32602, "Tool name and arguments are required");
      try {
        return rpcResponse(request.id, toolResult(await callTool(name, args as Record<string, unknown>)));
      } catch (error) {
        const detail = error instanceof ServiceError ? error.detail : { ok: false, error: error instanceof Error ? error.message : "Tool failed" };
        return rpcResponse(request.id, toolResult(detail, true));
      }
    }
    return rpcFailure(request.id, -32601, "Method not found");
  };
}

export async function startMcpServer() {
  const handle = await createMcpHandler();
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  let notificationTimer: NodeJS.Timeout | undefined;
  let skillWatcher: ReturnType<typeof watch> | undefined;
  try {
    skillWatcher = watch(resolve(process.cwd(), "skills"), { recursive: true }, () => {
      clearTimeout(notificationTimer);
      notificationTimer = setTimeout(() => process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/tools/list_changed" })}\n`), 100);
    });
  } catch { /* skills may not exist yet; tools/list still reloads on demand */ }
  lines.on("close", () => { clearTimeout(notificationTimer); skillWatcher?.close(); });
  lines.on("line", (line) => {
    void (async () => {
      try {
        const message = await handle(JSON.parse(line) as JsonRpcRequest);
        if (message) process.stdout.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        process.stdout.write(`${JSON.stringify(rpcFailure(undefined, -32700, error instanceof Error ? error.message : "Parse error"))}\n`);
      }
    })();
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void startMcpServer();
