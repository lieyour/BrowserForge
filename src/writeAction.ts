import { codeBlock, parseReadAction, validateActionInput, validateSchema, validSelector, type JsonSchema, type ReadAction } from "./readAction.js";

export type WriteOperation = "create" | "update" | "delete" | "submit";
export type WriteField = { selector: string; kind: "fill" | "select" | "check" };
export type WriteActionPlan = {
  version: 1;
  fields: Record<string, WriteField>;
  submitSelector: string;
  successSelector: string;
  failureSelector?: string;
  timeoutMs: number;
  confirmText: string;
};
export type WriteAction = {
  name: string;
  description?: string;
  mode: "write";
  operation: WriteOperation;
  scope: { origin: string; url: string; urlTemplate?: string };
  inputSchema: JsonSchema;
  outputSchema: JsonSchema;
  maxOutputChars: number;
  toolName?: string;
  risk: "write";
  published: boolean;
  contractVersion: string;
  resultMetadata: boolean;
  plan: WriteActionPlan;
};
export type WriteActionResult = {
  submitted: boolean;
  operation: WriteOperation;
  state: "SUCCESS" | "FAILURE" | "NOT_CONFIRMED" | "VALIDATION_FAILED" | "TIMEOUT";
  message?: string;
};
export type Action = ReadAction | WriteAction;

function exactWriteKeys(value: object, allowed: string[], label: string) {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) throw new Error(`Write action ${label} contains unknown field ${unknown}`);
}

function validateWriteScope(scope: WriteAction["scope"], inputSchema: JsonSchema) {
  if (!scope || typeof scope.origin !== "string" || typeof scope.url !== "string") throw new Error("Write action lacks scope.origin or scope.url");
  exactWriteKeys(scope, ["origin", "url", "urlTemplate"], "scope");
  let scopeUrl: URL;
  try { scopeUrl = new URL(scope.url); } catch { throw new Error("Write action has an invalid scope.url"); }
  if (scopeUrl.origin !== scope.origin) throw new Error("Write action scope.origin must match scope.url");
  if (scope.urlTemplate === undefined) return;
  if (typeof scope.urlTemplate !== "string" || scope.urlTemplate.length > 2_000) throw new Error("Write action scope.urlTemplate is invalid");
  const placeholders = [...scope.urlTemplate.matchAll(/\{([A-Za-z][A-Za-z0-9_-]{0,63})\}/g)].map((match) => match[1]);
  if (placeholders.length === 0 || scope.urlTemplate.replace(/\{[A-Za-z][A-Za-z0-9_-]{0,63}\}/g, "value").includes("{")) throw new Error("Write action scope.urlTemplate must contain valid input placeholders");
  if (placeholders.some((name) => !(name in (inputSchema.properties ?? {})) || !(inputSchema.required ?? []).includes(name))) throw new Error("Write action scope.urlTemplate placeholders must be required input fields");
  let templateUrl: URL;
  try { templateUrl = new URL(scope.urlTemplate.replace(/\{[A-Za-z][A-Za-z0-9_-]{0,63}\}/g, "value")); } catch { throw new Error("Write action scope.urlTemplate is invalid"); }
  if (templateUrl.origin !== scope.origin) throw new Error("Write action scope.urlTemplate origin must match scope.origin");
}

export function validateWriteActionPlan(plan: unknown, inputSchema: JsonSchema): asserts plan is WriteActionPlan {
  if (!plan || typeof plan !== "object" || Array.isArray(plan)) throw new Error("Write action plan is required");
  const value = plan as Partial<WriteActionPlan>;
  exactWriteKeys(value, ["version", "fields", "submitSelector", "successSelector", "failureSelector", "timeoutMs", "confirmText"], "plan");
  if (value.version !== 1) throw new Error("Write action plan version must be 1");
  if (!value.fields || typeof value.fields !== "object" || Array.isArray(value.fields)) throw new Error("Write action plan fields are required");
  const properties = inputSchema.properties ?? {};
  for (const [name, field] of Object.entries(value.fields)) {
    if (!(name in properties) || !field || typeof field !== "object" || Array.isArray(field)) throw new Error(`Write action plan field ${name} must map to an inputSchema property`);
    exactWriteKeys(field, ["selector", "kind"], `plan.fields.${name}`);
    validSelector(field.selector, `fields.${name}.selector`);
    if (!['fill', 'select', 'check'].includes(field.kind)) throw new Error(`Write action plan fields.${name}.kind is invalid`);
    const schemaType = properties[name].type;
    if (field.kind === "check" ? schemaType !== "boolean" : !["string", "number", "integer"].includes(schemaType || "")) throw new Error(`Write action plan fields.${name} does not match inputSchema type`);
  }
  validSelector(value.submitSelector, "submitSelector");
  validSelector(value.successSelector, "successSelector");
  if (value.failureSelector !== undefined) validSelector(value.failureSelector, "failureSelector");
  const selectors = [value.submitSelector, value.successSelector, value.failureSelector].filter((selector): selector is string => selector !== undefined);
  if (new Set(selectors).size !== selectors.length) throw new Error("Write action submit and evidence selectors must be distinct");
  if (!Number.isInteger(value.timeoutMs) || value.timeoutMs! < 100 || value.timeoutMs! > 10_000) throw new Error("Write action plan timeoutMs must be an integer from 100 to 10000");
  if (typeof value.confirmText !== "string" || value.confirmText.trim().length === 0 || value.confirmText.length > 300) throw new Error("Write action plan confirmText must be 1 to 300 characters");
}

export function parseWriteAction(source: string, expectedName?: string): WriteAction {
  let action: Partial<WriteAction>;
  try { action = JSON.parse(source) as Partial<WriteAction>; } catch { throw new Error("Write actions must use a declarative JSON plan"); }
  if (!action || typeof action !== "object" || Array.isArray(action) || typeof action.name !== "string") throw new Error("Write action lacks name");
  exactWriteKeys(action, ["name", "description", "mode", "operation", "scope", "inputSchema", "outputSchema", "maxOutputChars", "toolName", "risk", "published", "contractVersion", "resultMetadata", "plan"], "contract");
  if (expectedName && action.name !== expectedName) throw new Error(`Action name must match ${expectedName}`);
  if (action.mode !== "write") throw new Error("Only actions with mode: write may run");
  if (!action.operation || !["create", "update", "delete", "submit"].includes(action.operation)) throw new Error("Write action operation is invalid");
  validateSchema(action.inputSchema, "inputSchema");
  validateWriteScope(action.scope as WriteAction["scope"], action.inputSchema);
  validateSchema(action.outputSchema, "outputSchema");
  if (!Number.isInteger(action.maxOutputChars) || action.maxOutputChars! < 1 || action.maxOutputChars! > 1_000_000) throw new Error("Write action maxOutputChars must be an integer from 1 to 1000000");
  if (action.toolName !== undefined && (typeof action.toolName !== "string" || !/^[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(action.toolName))) throw new Error("Write action toolName must match <domain>_<action>");
  if (action.risk !== undefined && action.risk !== "write") throw new Error("Write action risk must be write");
  if (action.published !== undefined && typeof action.published !== "boolean") throw new Error("Write action published must be a boolean");
  if (action.contractVersion !== undefined && (typeof action.contractVersion !== "string" || !/^\d+(?:\.\d+)*$/.test(action.contractVersion))) throw new Error("Write action contractVersion must be a version string");
  if (action.resultMetadata !== undefined && typeof action.resultMetadata !== "boolean") throw new Error("Write action resultMetadata must be a boolean");
  validateWriteActionPlan(action.plan, action.inputSchema);
  return {
    name: action.name,
    description: action.description,
    mode: "write",
    operation: action.operation,
    scope: action.scope as WriteAction["scope"],
    inputSchema: action.inputSchema,
    outputSchema: action.outputSchema,
    maxOutputChars: action.maxOutputChars!,
    toolName: action.toolName,
    risk: "write",
    published: action.published ?? false,
    contractVersion: action.contractVersion ?? "1",
    resultMetadata: action.resultMetadata ?? false,
    plan: action.plan
  };
}

export function parseWriteActionReference(markdown: string, expectedName?: string) {
  const source = codeBlock(markdown);
  return { source, action: parseWriteAction(source, expectedName) };
}

export function parseAction(source: string, expectedName?: string): Action {
  let mode: unknown;
  try { mode = (JSON.parse(source) as { mode?: unknown }).mode; } catch { throw new Error("Legacy JavaScript actions must be migrated to a declarative JSON plan"); }
  if (mode === "read") return parseReadAction(source, expectedName);
  if (mode === "write") return parseWriteAction(source, expectedName);
  throw new Error("Action mode must be read or write");
}

export function parseActionReference(markdown: string, expectedName?: string) {
  const source = codeBlock(markdown);
  return { source, action: parseAction(source, expectedName) };
}

export type WriteResultState = "NOT_CONFIRMED" | "VALIDATION_FAILED" | "SUBMIT_UNKNOWN" | "SUCCESS_CONFIRMED" | "DUPLICATE_PREVENTED";

export type GuardedWriteContract = {
  version: 1;
  mode: "write";
  fixtureOnly: true;
  name: string;
  scope: { origin: string; url: string };
  inputSchema: JsonSchema;
  confirmationToken: string;
  reviewFields: string[];
  successEvidence: string;
  validationEvidence: string;
  timeoutMs: number;
  retry: "never";
};

export type GuardedWriteCall = { input: unknown; confirmationToken?: unknown; idempotencyKey?: unknown };

export class WriteIdempotencyLedger {
  private readonly keys = new Set<string>();
  reserve(key: string) { if (this.keys.has(key)) return false; this.keys.add(key); return true; }
}

function safeEvidenceSelector(value: unknown) {
  return typeof value === "string" && value.length > 0 && value.length <= 200 && !/[<>{};]/.test(value);
}

export function prepareGuardedFixtureWrite(contract: GuardedWriteContract, call: GuardedWriteCall, ledger: WriteIdempotencyLedger) {
  let url: URL;
  try { url = new URL(contract.scope.url); } catch { throw new Error("Write contract scope.url is invalid"); }
  if (contract.version !== 1 || contract.mode !== "write" || contract.fixtureOnly !== true || contract.retry !== "never") throw new Error("Only fixture-only, no-retry write contracts are accepted by this spike");
  if (url.origin !== contract.scope.origin || url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Write spike contracts are limited to local HTTP fixtures");
  if (!safeEvidenceSelector(contract.successEvidence) || !safeEvidenceSelector(contract.validationEvidence)) throw new Error("Write contract evidence selectors are invalid");
  if (!Number.isInteger(contract.timeoutMs) || contract.timeoutMs < 100 || contract.timeoutMs > 10_000) throw new Error("Write contract timeoutMs is invalid");
  if (call.confirmationToken !== contract.confirmationToken) return { ok: false as const, state: "NOT_CONFIRMED" as const };
  if (typeof call.idempotencyKey !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(call.idempotencyKey)) return { ok: false as const, state: "VALIDATION_FAILED" as const, message: "A valid idempotency key is required" };
  let input: Record<string, unknown>;
  try { input = validateActionInput(contract.inputSchema, call.input); } catch (error) { return { ok: false as const, state: "VALIDATION_FAILED" as const, message: error instanceof Error ? error.message : "Invalid input" }; }
  if (!ledger.reserve(call.idempotencyKey)) return { ok: false as const, state: "DUPLICATE_PREVENTED" as const };
  return { ok: true as const, input, idempotencyKey: call.idempotencyKey, review: Object.fromEntries(contract.reviewFields.map((name) => [name, input[name]])) };
}
