import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium, expect, test, type Page } from "@playwright/test";
import { parseWriteActionReference, prepareGuardedFixtureWrite, WriteIdempotencyLedger, type GuardedWriteContract, type GuardedWriteCall, type WriteOperation, type WriteResultState } from "../src/writeAction.js";

function close(server: ReturnType<typeof createServer>) { return new Promise<void>((done, reject) => server.close((error) => error ? reject(error) : done())); }

async function executeFixture(page: Page, contract: GuardedWriteContract, call: GuardedWriteCall, ledger: WriteIdempotencyLedger): Promise<{ state: WriteResultState; review?: Record<string, unknown> }> {
  const prepared = prepareGuardedFixtureWrite(contract, call, ledger);
  if (!prepared.ok) return { state: prepared.state };
  await page.goto(contract.scope.url);
  await page.locator('[name="item"]').fill(String(prepared.input.item));
  await page.locator('[name="quantity"]').fill(String(prepared.input.quantity));
  await page.getByRole("button", { name: "Create fixture order" }).click();
  const deadline = Date.now() + contract.timeoutMs;
  while (Date.now() < deadline) {
    if (await page.locator(contract.successEvidence).isVisible()) return { state: "SUCCESS_CONFIRMED", review: prepared.review };
    if (await page.locator(contract.validationEvidence).isVisible()) return { state: "VALIDATION_FAILED", review: prepared.review };
    if (page.url() !== contract.scope.url) return { state: "SUBMIT_UNKNOWN", review: prepared.review };
    await page.waitForTimeout(20);
  }
  return { state: "SUBMIT_UNKNOWN", review: prepared.review };
}

function writeReference(operation: WriteOperation = "create") {
  const action = {
    name: `${operation}-fixture-order`, description: `${operation} a fixture order.`, mode: "write", operation,
    scope: { origin: "https://example.test", url: `https://example.test/orders/${operation}` },
    inputSchema: { type: "object", properties: { item: { type: "string" }, quantity: { type: "integer" }, expedited: { type: "boolean" } }, required: ["item", "quantity", "expedited"], additionalProperties: false },
    outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
    maxOutputChars: 1000,
    plan: { version: 1, fields: { item: { selector: '[data-testid="item"]', kind: "fill" }, quantity: { selector: '[data-testid="quantity"]', kind: "select" }, expedited: { selector: '[data-testid="expedited"]', kind: "check" } }, submitSelector: '[data-testid="submit"]', successSelector: '[data-testid="success"]', failureSelector: '[data-testid="failure"]', timeoutMs: 500, confirmText: `Confirm ${operation} fixture order?` }
  };
  return `# Fixture order\n\n## Action: ${action.name}\n\n\`\`\`json\n${JSON.stringify(action)}\n\`\`\``;
}

test("write action parser accepts the finite demo contract and defaults metadata", () => {
  for (const operation of ["create", "update", "delete", "submit"] as const) {
    expect(parseWriteActionReference(writeReference(operation), `${operation}-fixture-order`).action).toMatchObject({ operation, mode: "write", risk: "write", published: false, contractVersion: "1", resultMetadata: false });
  }
});

test("write action parser rejects unknown keys, invalid mappings, selectors, schema types, and timeouts", () => {
  expect(() => parseWriteActionReference(writeReference().replace('"version":1', '"version":1,"steps":[]'))).toThrow("unknown field steps");
  expect(() => parseWriteActionReference(writeReference().replace('"item":{"selector"', '"missing":{"selector"'))).toThrow("inputSchema property");
  expect(() => parseWriteActionReference(writeReference().replace('[data-testid=\\"item\\"]', 'document.body'))).toThrow("valid CSS selector");
  expect(() => parseWriteActionReference(writeReference().replace('"expedited":{"type":"boolean"}', '"expedited":{"type":"string"}'))).toThrow("does not match inputSchema type");
  expect(() => parseWriteActionReference(writeReference().replace('"timeoutMs":500', '"timeoutMs":99'))).toThrow("100 to 10000");
});

test("guarded write spike characterizes confirmation, evidence, unknown outcomes, and duplicates on localhost only", async () => {
  const html = await readFile(resolve("fixtures/write-order.html"), "utf8");
  const requests: string[] = [];
  const fixture = createServer((request, response) => { requests.push(request.url || ""); response.end(html); });
  fixture.listen(0, "127.0.0.1");
  await once(fixture, "listening");
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Fixture did not bind a TCP port");
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const ledger = new WriteIdempotencyLedger();
  const contract = (scenario: string): GuardedWriteContract => ({
    version: 1, mode: "write", fixtureOnly: true, name: "create-fixture-order",
    scope: { origin: `http://127.0.0.1:${address.port}`, url: `http://127.0.0.1:${address.port}/write-order.html?scenario=${scenario}` },
    inputSchema: { type: "object", properties: { item: { type: "string", minLength: 1 }, quantity: { type: "string", pattern: "^[1-9][0-9]*$" } }, required: ["item", "quantity"], additionalProperties: false },
    confirmationToken: "CONFIRM_FIXTURE_ORDER", reviewFields: ["item", "quantity"], successEvidence: '[data-testid="success"]', validationEvidence: '[data-testid="validation-error"]', timeoutMs: 200, retry: "never"
  });
  const confirmed = (key: string): GuardedWriteCall => ({ input: { item: "demo", quantity: "1" }, confirmationToken: "CONFIRM_FIXTURE_ORDER", idempotencyKey: key });
  try {
    expect(prepareGuardedFixtureWrite(contract("success"), { ...confirmed("missing-confirmation"), confirmationToken: undefined }, ledger)).toMatchObject({ ok: false, state: "NOT_CONFIRMED" });
    expect(prepareGuardedFixtureWrite(contract("success"), { ...confirmed("short"), idempotencyKey: "x" }, ledger)).toMatchObject({ ok: false, state: "VALIDATION_FAILED" });
    await expect(executeFixture(page, contract("success"), confirmed("success-0001"), ledger)).resolves.toEqual({ state: "SUCCESS_CONFIRMED", review: { item: "demo", quantity: "1" } });
    await expect(executeFixture(page, contract("validation"), confirmed("validation-0001"), ledger)).resolves.toMatchObject({ state: "VALIDATION_FAILED" });
    await expect(executeFixture(page, contract("navigation"), confirmed("navigation-0001"), ledger)).resolves.toMatchObject({ state: "SUBMIT_UNKNOWN" });
    await expect(executeFixture(page, contract("timeout"), confirmed("timeout-0001"), ledger)).resolves.toMatchObject({ state: "SUBMIT_UNKNOWN" });
    const requestCount = requests.length;
    await expect(executeFixture(page, contract("timeout"), confirmed("timeout-0001"), ledger)).resolves.toEqual({ state: "DUPLICATE_PREVENTED" });
    expect(requests).toHaveLength(requestCount);
    expect(requests.every((url) => !/^https?:\/\//.test(url))).toBe(true);
    expect(() => prepareGuardedFixtureWrite({ ...contract("success"), fixtureOnly: true, scope: { origin: "https://rdms.dmall.com", url: "https://rdms.dmall.com/order" } }, confirmed("external-0001"), ledger)).toThrow("local HTTP fixtures");
  } finally {
    await browser.close();
    await close(fixture);
  }
});
