export type JsonSchemaProperty = {
  type?: "string" | "number" | "integer" | "boolean" | "array" | "object";
  enum?: Array<string | number | boolean>;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JsonSchema = { type: "object"; properties?: Record<string, JsonSchemaProperty>; required?: string[]; additionalProperties?: boolean };

export type ReadActionPlan = {
  version: 1;
  rootSelector: string;
  wait?: { selector: string; timeoutMs?: number };
  collection: { selector: string; rowSelector: string };
  fields: Record<string, { selector: string; attribute?: string }>;
  dedupeBy?: string;
  requireRows?: boolean;
  output: { key: string; fields: Record<string, string> };
};

export type ReadAction = {
  name: string; description?: string; mode: "read"; scope: { origin: string; url: string; urlTemplate?: string };
  inputSchema: JsonSchema; outputSchema: JsonSchema; maxOutputChars: number;
  toolName?: string; risk: "read"; published: boolean; contractVersion: string; resultMetadata: boolean; plan: ReadActionPlan;
};

export function codeBlock(markdown: string) {
  const blocks = [...markdown.matchAll(/```(?:json|js)\s*\n([\s\S]*?)```/g)].map((match) => match[1].trim());
  if (blocks.length !== 1) throw new Error("Reference must contain exactly one declarative action block");
  return blocks[0];
}

function exactKeys(value: object, allowed: string[], label: string) { const unknown = Object.keys(value).find((key) => !allowed.includes(key)); if (unknown) throw new Error(`Read action ${label} contains unknown field ${unknown}`); }
function validateSchemaProperty(property: unknown, label: string, depth = 0): asserts property is JsonSchemaProperty {
  if (!property || typeof property !== "object" || Array.isArray(property) || depth > 4) throw new Error(`Read action ${label} is invalid`);
  const value = property as JsonSchemaProperty;
  exactKeys(value, ["type", "enum", "minLength", "maxLength", "pattern", "items", "properties", "required", "additionalProperties"], label);
  if (value.type !== undefined && !["string", "number", "integer", "boolean", "array", "object"].includes(value.type)) throw new Error(`Read action ${label}.type is invalid`);
  if (value.enum !== undefined && (!Array.isArray(value.enum) || value.enum.length === 0)) throw new Error(`Read action ${label}.enum is invalid`);
  for (const key of ["minLength", "maxLength"] as const) if (value[key] !== undefined && (!Number.isInteger(value[key]) || value[key]! < 0)) throw new Error(`Read action ${label}.${key} is invalid`);
  if (value.minLength !== undefined && value.maxLength !== undefined && value.minLength > value.maxLength) throw new Error(`Read action ${label} length limits are invalid`);
  if (value.pattern !== undefined) { if (typeof value.pattern !== "string") throw new Error(`Read action ${label}.pattern is invalid`); try { new RegExp(value.pattern); } catch { throw new Error(`Read action ${label}.pattern is invalid`); } }
  if (value.items !== undefined) {
    if (value.type !== "array") throw new Error(`Read action ${label}.items requires type array`);
    validateSchemaProperty(value.items, `${label}.items`, depth + 1);
  }
  if (value.properties !== undefined) {
    if (value.type !== "object" || !value.properties || Array.isArray(value.properties)) throw new Error(`Read action ${label}.properties is invalid`);
    for (const [name, nested] of Object.entries(value.properties)) validateSchemaProperty(nested, `${label}.properties.${name}`, depth + 1);
  }
  if (value.required !== undefined && (value.type !== "object" || !Array.isArray(value.required) || value.required.some((name) => typeof name !== "string" || !(name in (value.properties ?? {}))) || new Set(value.required).size !== value.required.length)) throw new Error(`Read action ${label}.required is invalid`);
  if (value.additionalProperties !== undefined && (value.type !== "object" || typeof value.additionalProperties !== "boolean")) throw new Error(`Read action ${label}.additionalProperties is invalid`);
}

export function validateSchema(value: unknown, label: string): asserts value is JsonSchema {
  if (!value || typeof value !== "object" || Array.isArray(value) || (value as JsonSchema).type !== "object") throw new Error(`Read action lacks ${label}`);
  const schema = value as JsonSchema;
  exactKeys(schema, ["type", "properties", "required", "additionalProperties"], label);
  if (schema.properties !== undefined && (!schema.properties || typeof schema.properties !== "object" || Array.isArray(schema.properties))) throw new Error(`Read action ${label}.properties is invalid`);
  for (const [name, property] of Object.entries(schema.properties ?? {})) validateSchemaProperty(property, `${label}.properties.${name}`);
  if (schema.required !== undefined && (!Array.isArray(schema.required) || schema.required.some((name) => typeof name !== "string" || !(name in (schema.properties ?? {}))) || new Set(schema.required).size !== schema.required.length)) throw new Error(`Read action ${label}.required is invalid`);
  if (schema.additionalProperties !== undefined && typeof schema.additionalProperties !== "boolean") throw new Error(`Read action ${label}.additionalProperties is invalid`);
}
export function validSelector(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length < 1 || value.length > 500 || /[<{};]/.test(value) || /\b(?:document|window|cookie|localStorage|sessionStorage|indexedDB|fetch)\b/i.test(value)) throw new Error(`Read action ${label} must be a valid CSS selector`);
}

export function validateReadActionPlan(plan: unknown): asserts plan is ReadActionPlan {
  if (!plan || typeof plan !== "object") throw new Error("Read action plan is required");
  const value = plan as Partial<ReadActionPlan>;
  exactKeys(value, ["version", "rootSelector", "wait", "collection", "fields", "dedupeBy", "requireRows", "output"], "plan");
  if (value.version !== 1) throw new Error("Read action plan version must be 1");
  validSelector(value.rootSelector, "rootSelector");
  if (/^(?:html|body|table|:root)$/i.test(value.rootSelector.trim())) throw new Error("Read action rootSelector must identify a scoped module");
  if (!value.collection || typeof value.collection !== "object") throw new Error("Read action plan collection is required");
  exactKeys(value.collection, ["selector", "rowSelector"], "plan.collection");
  validSelector(value.collection.selector, "collection.selector"); validSelector(value.collection.rowSelector, "collection.rowSelector");
  if (value.wait !== undefined) { if (!value.wait || typeof value.wait !== "object") throw new Error("Read action plan wait is invalid"); exactKeys(value.wait, ["selector", "timeoutMs"], "plan.wait"); validSelector(value.wait.selector, "wait.selector"); if (value.wait.timeoutMs !== undefined && (!Number.isInteger(value.wait.timeoutMs) || value.wait.timeoutMs < 0 || value.wait.timeoutMs > 30_000)) throw new Error("Read action plan wait.timeoutMs is invalid"); }
  if (!value.fields || typeof value.fields !== "object" || Array.isArray(value.fields) || Object.keys(value.fields).length === 0) throw new Error("Read action plan fields are required");
  for (const [name, field] of Object.entries(value.fields)) { if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || !field || typeof field !== "object") throw new Error("Read action plan field mapping is invalid"); exactKeys(field, ["selector", "attribute"], `plan.fields.${name}`); validSelector(field.selector, `fields.${name}.selector`); if (field.attribute !== undefined && (typeof field.attribute !== "string" || !/^[A-Za-z_:][A-Za-z0-9_.:-]*$/.test(field.attribute) || /^cookie$/i.test(field.attribute))) throw new Error(`Read action plan fields.${name}.attribute is invalid`); }
  if (value.dedupeBy !== undefined && (typeof value.dedupeBy !== "string" || !(value.dedupeBy in value.fields))) throw new Error("Read action plan dedupeBy must reference a field");
  if (value.requireRows !== undefined && typeof value.requireRows !== "boolean") throw new Error("Read action plan requireRows must be a boolean");
  if (!value.output || typeof value.output !== "object" || typeof value.output.key !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(value.output.key)) throw new Error("Read action plan output.key is invalid");
  exactKeys(value.output, ["key", "fields"], "plan.output");
  if (!value.output.fields || typeof value.output.fields !== "object" || Array.isArray(value.output.fields)) throw new Error("Read action plan output.fields are required");
  for (const [name, field] of Object.entries(value.output.fields)) if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(name) || typeof field !== "string" || !(field in value.fields)) throw new Error(`Read action plan output.fields.${name} must reference a field`);
}

export function parseReadAction(source: string, expectedName?: string): ReadAction {
  let action: Partial<ReadAction>;
  try { action = JSON.parse(source) as Partial<ReadAction>; } catch { throw new Error("Legacy JavaScript actions must be migrated to a declarative JSON plan"); }
  if (!action || typeof action !== "object" || typeof action.name !== "string") throw new Error("Read action lacks name");
  exactKeys(action, ["name", "description", "mode", "scope", "inputSchema", "outputSchema", "maxOutputChars", "toolName", "risk", "published", "contractVersion", "resultMetadata", "plan"], "contract");
  if (expectedName && action.name !== expectedName) throw new Error(`Action name must match ${expectedName}`);
  if (action.mode !== "read") throw new Error("Only actions with mode: read may run");
  if (!action.scope || typeof action.scope.origin !== "string" || typeof action.scope.url !== "string") throw new Error("Read action lacks scope.origin or scope.url");
  exactKeys(action.scope, ["origin", "url", "urlTemplate"], "scope");
  let scopeUrl: URL; try { scopeUrl = new URL(action.scope.url); } catch { throw new Error("Read action has an invalid scope.url"); }
  if (scopeUrl.origin !== action.scope.origin) throw new Error("Read action scope.origin must match scope.url");
  const inputSchema = action.inputSchema;
  validateSchema(inputSchema, "inputSchema");
  if (action.scope.urlTemplate !== undefined) {
    if (typeof action.scope.urlTemplate !== "string" || action.scope.urlTemplate.length > 2_000) throw new Error("Read action scope.urlTemplate is invalid");
    const placeholders = [...action.scope.urlTemplate.matchAll(/\{([A-Za-z][A-Za-z0-9_-]{0,63})\}/g)].map((match) => match[1]);
    if (placeholders.length === 0 || action.scope.urlTemplate.replace(/\{[A-Za-z][A-Za-z0-9_-]{0,63}\}/g, "value").includes("{")) throw new Error("Read action scope.urlTemplate must contain valid input placeholders");
    if (placeholders.some((name) => !(name in (inputSchema.properties ?? {})) || !(inputSchema.required ?? []).includes(name))) throw new Error("Read action scope.urlTemplate placeholders must be required input fields");
    let templateUrl: URL; try { templateUrl = new URL(action.scope.urlTemplate.replace(/\{[A-Za-z][A-Za-z0-9_-]{0,63}\}/g, "value")); } catch { throw new Error("Read action scope.urlTemplate is invalid"); }
    if (templateUrl.origin !== action.scope.origin) throw new Error("Read action scope.urlTemplate origin must match scope.origin");
  }
  validateSchema(action.outputSchema, "outputSchema");
  const maxOutputChars = action.maxOutputChars;
  if (typeof maxOutputChars !== "number" || !Number.isInteger(maxOutputChars) || maxOutputChars < 1 || maxOutputChars > 1_000_000) throw new Error("Read action maxOutputChars must be an integer from 1 to 1000000");
  if (action.toolName !== undefined && (typeof action.toolName !== "string" || !/^[a-z0-9]+_[a-z0-9]+(?:_[a-z0-9]+)*$/.test(action.toolName))) throw new Error("Read action toolName must match <domain>_<action>");
  if (action.risk !== undefined && action.risk !== "read") throw new Error("Read action risk must be read");
  if (action.published !== undefined && typeof action.published !== "boolean") throw new Error("Read action published must be a boolean");
  if (action.contractVersion !== undefined && (typeof action.contractVersion !== "string" || !/^\d+(?:\.\d+)*$/.test(action.contractVersion))) throw new Error("Read action contractVersion must be a version string");
  if (action.resultMetadata !== undefined && typeof action.resultMetadata !== "boolean") throw new Error("Read action resultMetadata must be a boolean");
  validateReadActionPlan(action.plan);
  return { name: action.name, description: action.description, mode: "read", scope: action.scope, inputSchema, outputSchema: action.outputSchema, maxOutputChars, toolName: action.toolName, risk: "read", published: action.published ?? false, contractVersion: action.contractVersion ?? "1", resultMetadata: action.resultMetadata ?? false, plan: action.plan };
}

export function parseReadActionReference(markdown: string, expectedName?: string) { const source = codeBlock(markdown); return { source, action: parseReadAction(source, expectedName) }; }
export function validateActionInput(schema: JsonSchema, value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Action input must be an object");
  const input = value as Record<string, unknown>;
  const properties = schema.properties ?? {};
  if (schema.additionalProperties === false && Object.keys(input).some((key) => !(key in properties))) throw new Error("Action input contains an unknown field");
  for (const name of schema.required ?? []) if (input[name] === undefined) throw new Error(`Action input is missing ${name}`);
  for (const [name, definition] of Object.entries(properties)) {
    const item = input[name];
    if (item === undefined || !definition.type) continue;
    const actual = Array.isArray(item) ? "array" : item === null ? "null" : typeof item;
    if (definition.type === "integer" ? !Number.isInteger(item) : actual !== definition.type) throw new Error(`Action input ${name} must be ${definition.type}`);
    if (definition.enum && !definition.enum.includes(item as never)) throw new Error(`Action input ${name} is not an allowed value`);
    if (typeof item === "string") {
      if (definition.minLength !== undefined && item.length < definition.minLength) throw new Error(`Action input ${name} is too short`);
      if (definition.maxLength !== undefined && item.length > definition.maxLength) throw new Error(`Action input ${name} is too long`);
      if (definition.pattern !== undefined && !new RegExp(definition.pattern).test(item)) throw new Error(`Action input ${name} has an invalid format`);
    }
  }
  return input;
}
export function scopeMatches(scope: ReadAction["scope"], currentUrl: string) { try { const current = new URL(currentUrl); return current.origin === scope.origin && current.href === new URL(scope.url).href; } catch { return false; } }
export function validateActionOutput(schema: JsonSchema, value: unknown, maxOutputChars: number) { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Action result must be a JSON object"); for (const name of schema.required ?? []) if (!(name in value)) throw new Error(`Action result is missing ${name}`); const serialized = JSON.stringify(value); if (serialized.length > maxOutputChars) throw new Error("Action output exceeds maxOutputChars"); return JSON.parse(serialized) as unknown; }
