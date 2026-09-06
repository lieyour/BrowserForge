import { expect, test } from "@playwright/test";
import { generateSkillWithResponses, responsesTimeoutMs, skillGenerationInstructions, writeSkillGenerationInstructions } from "../src/generator/responsesClient.js";

test("skill generation instructions require route-specific actions", () => {
  expect(skillGenerationInstructions).toContain("Never generate a generic action that only returns the current page title, URL, or raw page text.");
  expect(skillGenerationInstructions).toContain("scope.url must be the supplied snapshot URL, including its route.");
  expect(skillGenerationInstructions).toContain("strict JSON");
  expect(skillGenerationInstructions).toContain("Do not emit execute functions");
  expect(skillGenerationInstructions).toContain("smallest business fields needed for the task");
  expect(writeSkillGenerationInstructions).toContain("Return exactly one reference");
  expect(writeSkillGenerationInstructions).toContain("one final click");
  expect(writeSkillGenerationInstructions).toContain("There is no retry, arbitrary JavaScript");
});

test("Responses timeout is bounded and configurable", () => {
  expect(responsesTimeoutMs()).toBe(120_000);
  expect(responsesTimeoutMs("90000")).toBe(90_000);
  expect(responsesTimeoutMs("999")).toBe(120_000);
  expect(responsesTimeoutMs("invalid")).toBe(120_000);
});

test("invalid model output is repaired once and terra is the default model", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BROWSERFORGE_API_KEY;
  const originalModel = process.env.BROWSERFORGE_MODEL;
  const requests: Array<Record<string, unknown>> = [];
  const validPackage = {
    skill: "---\nname: browsing-example.com\ndescription: List observed records.\n---\n\n## Action Index\n- [List records](references/list-records.md)\n",
    references: [{
      filename: "list-records.md",
      content: `# List records\n\n## Action: list-records\n\n## Requirements\n\n- Open the observed page.\n\n## How to run this action\n\nRun the generated read action.\n\n## Navigate to\n\nhttps://example.com/records\n\n\`\`\`json\n{"name":"list-records","description":"List observed records.","mode":"read","contractVersion":"1","scope":{"origin":"https://example.com","url":"https://example.com/records"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"records":{"type":"array"}},"required":["records"],"additionalProperties":false},"maxOutputChars":4000,"plan":{"version":1,"rootSelector":"table.records","collection":{"selector":"tbody","rowSelector":"tr"},"fields":{"name":{"selector":"td:nth-of-type(1)"}},"output":{"key":"records","fields":{"name":"name"}}}}\n\`\`\`\n\n## Returns\n\nA records array.\n`
    }]
  };

  process.env.BROWSERFORGE_API_KEY = "test-key";
  delete process.env.BROWSERFORGE_MODEL;
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    const output_text = requests.length === 1 ? "not json" : JSON.stringify(validPackage);
    return new Response(JSON.stringify({ output_text }), { status: 200, headers: { "content-type": "application/json" } });
  };

  try {
    const generated = await generateSkillWithResponses({
      url: "https://example.com/records",
      title: "Records",
      visibleText: "Name Alpha",
      elements: [{ tag: "table", selector: "table.records", headers: ["Name"], rowCount: 1, columnCount: 1 }]
    });
    expect(generated.references[0].filename).toBe("list-records.md");
    expect(requests).toHaveLength(2);
    expect(requests[0].model).toBe("gpt-5.6-terra");
    expect(JSON.stringify(requests[1])).toContain("not json");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BROWSERFORGE_API_KEY;
    else process.env.BROWSERFORGE_API_KEY = originalKey;
    if (originalModel === undefined) delete process.env.BROWSERFORGE_MODEL;
    else process.env.BROWSERFORGE_MODEL = originalModel;
  }
});

test("transient gateway failures are retried once", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BROWSERFORGE_API_KEY;
  let calls = 0;
  process.env.BROWSERFORGE_API_KEY = "test-key";
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("gateway timeout", { status: 504 });
    return new Response(JSON.stringify({ output_text: JSON.stringify({
      skill: "---\nname: browsing-example.com\ndescription: List observed records.\n---\n",
      references: [{ filename: "list-records.md", content: `# List records\n\n## Action: list-records\n\n\`\`\`json\n{"name":"list-records","mode":"read","contractVersion":"1","scope":{"origin":"https://example.com","url":"https://example.com/records"},"inputSchema":{"type":"object","properties":{},"additionalProperties":false},"outputSchema":{"type":"object","properties":{"records":{"type":"array"}},"required":["records"]},"maxOutputChars":1000,"plan":{"version":1,"rootSelector":"table.records","collection":{"selector":"tbody","rowSelector":"tr"},"fields":{"name":{"selector":"td:nth-of-type(1)"}},"output":{"key":"records","fields":{"name":"name"}}}}\n\`\`\`` }]
    }) }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await expect(generateSkillWithResponses({ url: "https://example.com/records", title: "Records", visibleText: "Name", elements: [] })).resolves.toBeTruthy();
    expect(calls).toBe(2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BROWSERFORGE_API_KEY;
    else process.env.BROWSERFORGE_API_KEY = originalKey;
  }
});

test("write generation uses the finite write prompt and accepts one validated write reference", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.BROWSERFORGE_API_KEY;
  const requests: Array<Record<string, any>> = [];
  process.env.BROWSERFORGE_API_KEY = "test-key";
  const validPackage = {
    skill: "---\nname: browsing-example.com\ndescription: Create an observed order.\n---\n",
    references: [{
      filename: "create-order.md",
      content: `# Create order\n\n## Action: create-order\n\n\`\`\`json\n${JSON.stringify({
        name: "create-order", description: "Create an observed order.", mode: "write", operation: "create", contractVersion: "1",
        scope: { origin: "https://example.com", url: "https://example.com/orders/new" },
        inputSchema: { type: "object", properties: { item: { type: "string" }, quantity: { type: "integer" }, expedited: { type: "boolean" } }, required: ["item", "quantity", "expedited"], additionalProperties: false },
        outputSchema: { type: "object", properties: { submitted: { type: "boolean" }, operation: { type: "string" }, state: { type: "string" }, message: { type: "string" } }, required: ["submitted", "operation", "state"], additionalProperties: false },
        maxOutputChars: 1000,
        plan: { version: 1, fields: { item: { selector: "#item", kind: "fill" }, quantity: { selector: "#quantity", kind: "select" }, expedited: { selector: "#expedited", kind: "check" } }, submitSelector: "#submit", successSelector: "#success", failureSelector: "#failure", timeoutMs: 1000, confirmText: "Create this order?" }
      })}\n\`\`\``
    }]
  };
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ output_text: JSON.stringify(validPackage) }), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    await expect(generateSkillWithResponses({
      url: "https://example.com/orders/new", title: "New order", visibleText: "Item Quantity Create",
      generationMode: "write",
      elements: [{ tag: "input", selector: "#item" }, { tag: "select", selector: "#quantity", options: ["1", "2"] }, { tag: "input", type: "checkbox", selector: "#expedited" }, { tag: "button", selector: "#submit", text: "Create" }, { tag: "p", selector: "#success", text: "Created" }]
    })).resolves.toMatchObject({ references: [{ filename: "create-order.md" }] });
    expect(requests).toHaveLength(1);
    expect(requests[0].input[0].content).toContain("Return exactly one reference");
    expect(JSON.parse(requests[0].input[1].content[0].text)).toMatchObject({ generationMode: "write" });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.BROWSERFORGE_API_KEY;
    else process.env.BROWSERFORGE_API_KEY = originalKey;
  }
});
