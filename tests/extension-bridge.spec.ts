import { createServer } from "node:http";
import { once } from "node:events";
import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { chromium, expect, test } from "@playwright/test";
import { createBrowserForgeServer } from "../src/server.js";
import { writeSkillPackage } from "../src/generator/skillPackage.js";

function close(server: { close(callback: (error?: Error) => void): void }) { return new Promise<void>((resolveClose, reject) => server.close((error) => error ? reject(error) : resolveClose())); }
async function call(port: number, path: string, body: unknown) {
  const response = await fetch(`http://127.0.0.1:${port}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() as Record<string, unknown> };
}

test("extension bridge interprets a declarative table plan in the active tab", async () => {
  const fixture = createServer((_request, response) => response.end(`<!doctype html><section data-module="orders"><div data-rows><div data-row><span data-id>A-1</span><span data-status>ready</span></div><div data-row><span data-id>A-1</span><span data-status>ready</span></div></div></section><table data-testid="evidence-table"><thead><tr><th>Item</th></tr></thead><tbody><tr><td>A</td></tr></tbody></table>`));
  fixture.listen(0, "127.0.0.1"); await once(fixture, "listening");
  const fixtureAddress = fixture.address(); if (!fixtureAddress || typeof fixtureAddress === "string") throw new Error("Fixture did not bind a TCP port");
  const url = `http://127.0.0.1:${fixtureAddress.port}/orders`;
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-extension-"));
  const action = (name: string, overrides: Record<string, unknown> = {}) => ({ name, mode: "read", scope: { origin: new URL(url).origin, url }, inputSchema: { type: "object", properties: {}, additionalProperties: false }, outputSchema: { type: "object", properties: { orders: { type: "array" } }, required: ["orders"] }, maxOutputChars: 500, plan: { version: 1, rootSelector: "[data-module=orders]", collection: { selector: "[data-rows]", rowSelector: "[data-row]" }, fields: { id: { selector: "[data-id]" }, status: { selector: "[data-status]" } }, dedupeBy: "id", output: { key: "orders", fields: { id: "id", status: "status" } } }, ...overrides });
  const actions = [
    action("list-orders"),
    action("missing-root", { plan: { ...action("x").plan, rootSelector: "[data-module=missing]" } }),
    action("missing-data", { plan: { ...action("x").plan, collection: { selector: "[data-missing]", rowSelector: "[data-row]" } } }),
    action("empty-data", { plan: { ...action("x").plan, collection: { selector: "[data-rows]", rowSelector: "[data-missing-row]" }, requireRows: true } }),
    action("delayed-data", {
      contractVersion: "2", resultMetadata: true,
      outputSchema: { type: "object", properties: { toolVersion: { type: "string" }, route: { type: "string" }, count: { type: "integer" }, orders: { type: "array" } }, required: ["toolVersion", "route", "count", "orders"] },
      plan: { ...action("x").plan, rootSelector: "[data-module=delayed]", wait: { selector: "[data-rows]", timeoutMs: 1_000 } }
    }),
    action("wrong-scope", { scope: { origin: new URL(url).origin, url: `${url}#wrong` } }),
    action("too-large", { maxOutputChars: 10 })
  ];
  await writeSkillPackage("example.test", { skill: "---\nname: browsing-example-test\ndescription: Example.\n---\n", references: actions.map((item) => ({ filename: `${item.name}.md`, content: `# ${item.name}\n\n## Action: ${item.name}\n\n\`\`\`json\n${JSON.stringify(item)}\n\`\`\`` })) }, workspace);
  const service = createBrowserForgeServer(workspace); service.listen(0, "127.0.0.1"); await once(service, "listening");
  const serviceAddress = service.address(); if (!serviceAddress || typeof serviceAddress === "string") throw new Error("Service did not bind a TCP port");
  const extension = await mkdtemp(resolve(tmpdir(), "browserforge-unpacked-extension-"));
  await cp(resolve("extension"), extension, { recursive: true });
  await readFile(resolve(extension, "background.js"), "utf8").then((content) => writeFile(resolve(extension, "background.js"), content.replace("http://127.0.0.1:8787", `http://127.0.0.1:${serviceAddress.port}`)));
  const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  try {
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker");
    const page = await context.newPage(); await page.goto(url);
    let result: { status: number; body: Record<string, unknown> } | undefined;
    await expect.poll(async () => {
      result = await call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "list-orders", input: {} });
      return result.status === 200 ? "ready" : JSON.stringify(result);
    }, { timeout: 10_000 }).toBe("ready");
    expect(result?.body).toMatchObject({ ok: true, data: { orders: [{ id: "A-1", status: "ready" }] }, invocation: { tool: "browserforge_run_read_action", action: "list-orders" } });
    const snapshot = await worker.evaluate(async () => {
      const chromeApi = (globalThis as any).chrome;
      const [current] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      return chromeApi.tabs.sendMessage(current.id, { type: "BROWSING_SKILLS_SNAPSHOT" });
    });
    expect(snapshot.elements).toContainEqual(expect.objectContaining({ tag: "table", selector: '[data-testid="evidence-table"]', headers: ["Item"], rowCount: 1, columnCount: 1 }));
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "missing-root", input: {} })).resolves.toMatchObject({ status: 400, body: { code: "ROOT_NOT_FOUND" } });
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "missing-data", input: {} })).resolves.toMatchObject({ status: 400, body: { code: "DATA_NOT_READY" } });
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "empty-data", input: {} })).resolves.toMatchObject({ status: 400, body: { code: "EMPTY_DATA" } });
    await page.evaluate(() => {
      document.querySelector("[data-module=delayed]")?.remove();
      setTimeout(() => document.body.insertAdjacentHTML("beforeend", '<section data-module="delayed"><div data-rows><div data-row><span data-id>D-1</span><span data-status>ready</span></div></div></section>'), 150);
    });
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "delayed-data", input: {} })).resolves.toMatchObject({ status: 200, body: { data: { toolVersion: "2", route: url, count: 1, orders: [{ id: "D-1", status: "ready" }] } } });
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "wrong-scope", input: {} })).resolves.toMatchObject({ status: 400, body: { code: "SCOPE_MISMATCH" } });
    await expect(call(serviceAddress.port, "/api/actions/run", { domain: "example.test", action: "too-large", input: {} })).resolves.toMatchObject({ status: 400, body: { code: "OUTPUT_TOO_LARGE" } });
    const invalid = await worker.evaluate(async (command) => {
      const chromeApi = (globalThis as any).chrome;
      const [current] = await chromeApi.tabs.query({ active: true, lastFocusedWindow: true });
      await chromeApi.scripting.executeScript({ target: { tabId: current.id }, files: ["content.js"] });
      return chromeApi.tabs.sendMessage(current.id, { type: "BROWSERFORGE_RUN_READ_ACTION", command });
    }, { type: "run-read-action", taskId: "invalid", action: { ...action("invalid"), plan: { ...action("invalid").plan, operation: "click" } }, input: {} });
    expect(invalid).toMatchObject({ ok: false, error: { code: "INVALID_PLAN" } });
  } finally {
    await context.close(); await close(service); await close(fixture);
  }
});

test("extension bridge performs one confirmed demo write with deterministic outcomes and no retry", async () => {
  const html = await readFile(resolve("fixtures/write-order.html"), "utf8");
  const fixture = createServer((_request, response) => { response.setHeader("content-type", "text/html"); response.end(html); });
  fixture.listen(0, "127.0.0.1"); await once(fixture, "listening");
  const fixtureAddress = fixture.address(); if (!fixtureAddress || typeof fixtureAddress === "string") throw new Error("Fixture did not bind a TCP port");
  const origin = `http://127.0.0.1:${fixtureAddress.port}`;
  const workspace = await mkdtemp(resolve(tmpdir(), "browserforge-write-extension-"));
  const action = (name: string, scenario: string, overrides: Record<string, any> = {}) => ({
    name, mode: "write", operation: "create", scope: { origin, url: `${origin}/write-order.html?scenario=${scenario}` },
    inputSchema: { type: "object", properties: { item: { type: "string", minLength: 1 }, quantity: { type: "integer" }, priority: { type: "string", enum: ["normal", "high"] }, expedited: { type: "boolean" } }, required: ["item", "quantity", "priority", "expedited"], additionalProperties: false },
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
    maxOutputChars: 1000,
    plan: { version: 1, fields: { item: { selector: '[data-testid="item"]', kind: "fill" }, quantity: { selector: '[name="quantity"]', kind: "fill" }, priority: { selector: '[data-testid="priority"]', kind: "select" }, expedited: { selector: '[data-testid="expedited"]', kind: "check" } }, submitSelector: '[data-testid="submit"]', successSelector: '[data-testid="success"]', failureSelector: '[data-testid="failure"]', timeoutMs: 250, confirmText: "Create fixture order?" },
    ...overrides
  });
  const actions = [
    action("create-order-success", "success"),
    action("create-order-cancel", "success"),
    action("create-order-failure", "failure"),
    action("create-order-timeout", "timeout", { plan: { ...action("x", "timeout").plan, timeoutMs: 150 } }),
    action("create-order-missing", "success", { plan: { ...action("x", "success").plan, fields: { ...action("x", "success").plan.fields, priority: { selector: '[data-testid="missing"]', kind: "select" } } } })
  ];
  await writeSkillPackage("fixture.test", { skill: "---\nname: browsing-fixture\ndescription: Fixture.\n---\n", references: actions.map((item) => ({ filename: `${item.name}.md`, content: `# ${item.name}\n\n## Action: ${item.name}\n\n\`\`\`json\n${JSON.stringify(item)}\n\`\`\`` })) }, workspace);
  const service = createBrowserForgeServer(workspace); service.listen(0, "127.0.0.1"); await once(service, "listening");
  const serviceAddress = service.address(); if (!serviceAddress || typeof serviceAddress === "string") throw new Error("Service did not bind a TCP port");
  const servicePort = serviceAddress.port;
  const extension = await mkdtemp(resolve(tmpdir(), "browserforge-write-unpacked-extension-"));
  await cp(resolve("extension"), extension, { recursive: true });
  await readFile(resolve(extension, "background.js"), "utf8").then((content) => writeFile(resolve(extension, "background.js"), content.replace("http://127.0.0.1:8787", `http://127.0.0.1:${servicePort}`)));
  const context = await chromium.launchPersistentContext("", { channel: "chromium", headless: true, args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`] });
  const input = { item: "demo", quantity: 2, priority: "high", expedited: true };
  async function run(name: string) {
    let result: { status: number; body: Record<string, unknown> } | undefined;
    await expect.poll(async () => {
      result = await call(servicePort, "/api/actions/run", { domain: "fixture.test", action: name, mode: "write", input });
      return result.status === 503 ? "waiting" : "done";
    }, { timeout: 10_000 }).toBe("done");
    return result!;
  }
  try {
    await (context.serviceWorkers()[0] ? Promise.resolve() : context.waitForEvent("serviceworker"));
    const page = await context.newPage();

    await page.goto(actions[0].scope.url);
    let confirms = 0;
    page.once("dialog", async (dialog) => { confirms++; expect(dialog.type()).toBe("confirm"); await dialog.accept(); });
    await expect(run("create-order-success")).resolves.toMatchObject({ status: 200, body: { ok: true, data: { submitted: true, operation: "create", state: "SUCCESS" }, invocation: { tool: "browserforge_run_write_action" } } });
    expect(confirms).toBe(1);
    await expect(page.locator('[data-testid="item"]')).toHaveValue("demo");
    await expect(page.locator('[data-testid="priority"]')).toHaveValue("high");
    await expect(page.locator('[data-testid="expedited"]')).toBeChecked();
    await expect(page.locator('[data-testid="submit-count"]')).toHaveText("1");

    await page.goto(actions[1].scope.url);
    page.once("dialog", (dialog) => dialog.dismiss());
    await expect(run("create-order-cancel")).resolves.toMatchObject({ status: 200, body: { data: { submitted: false, state: "NOT_CONFIRMED" } } });
    await expect(page.locator('[data-testid="submit-count"]')).toHaveText("0");

    await page.goto(actions[2].scope.url);
    page.once("dialog", (dialog) => dialog.accept());
    await expect(run("create-order-failure")).resolves.toMatchObject({ status: 200, body: { data: { submitted: true, state: "FAILURE", message: "Fixture order failed" } } });
    await expect(page.locator('[data-testid="submit-count"]')).toHaveText("1");

    await page.goto(actions[3].scope.url);
    page.once("dialog", (dialog) => dialog.accept());
    await expect(run("create-order-timeout")).resolves.toMatchObject({ status: 200, body: { data: { submitted: true, state: "TIMEOUT" } } });
    await expect(page.locator('[data-testid="submit-count"]')).toHaveText("1");

    await page.goto(actions[4].scope.url);
    await expect(run("create-order-missing")).resolves.toMatchObject({ status: 200, body: { data: { submitted: false, state: "VALIDATION_FAILED", message: expect.stringContaining("priority") } } });
    await expect(page.locator('[data-testid="item"]')).toHaveValue("");
    await expect(page.locator('[data-testid="submit-count"]')).toHaveText("0");
  } finally {
    await context.close(); await close(service); await close(fixture);
  }
});
