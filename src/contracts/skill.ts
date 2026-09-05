export type LocatorStrategy = "label" | "role" | "aria" | "placeholder" | "testid" | "css";

export type CandidateLocator = { strategy: LocatorStrategy; value: string };

export type FieldKind = "text" | "email" | "tel" | "date" | "radio" | "checkbox" | "select" | "textarea";

export type FormField = {
  name: string;
  label: string;
  kind: FieldKind;
  required: boolean;
  options?: string[];
  locators: CandidateLocator[];
};

export type FormExploration = {
  sourceUrl: string;
  origin: string;
  title: string;
  fields: FormField[];
  submit: { label: string; locators: CandidateLocator[] };
  successEvidence: CandidateLocator[];
  risk: "read" | "write" | "high-risk";
};

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; enum?: string[]; items?: { type: string } }>;
  required: string[];
  additionalProperties: boolean;
};

export type ActionManifest = {
  name: string;
  site: string;
  version: string;
  inputSchema: JsonSchema;
  outputSchema: object;
  risk: "write";
  navigation: { url: string };
  generatedAt: string;
  verifiedAt?: string;
};

export type RunErrorCode =
  | "INVALID_INPUT"
  | "NAVIGATION_FAILED"
  | "FIELD_NOT_FOUND"
  | "FIELD_VALUE_MISMATCH"
  | "SUBMIT_FAILED"
  | "SUCCESS_NOT_CONFIRMED";

export type RunResult = {
  ok: boolean;
  data?: unknown;
  error?: { code: RunErrorCode; message: string; field?: string; recoverable: boolean };
  telemetry: { exploration: false; durationMs: number; fieldsFilled: number; domInspectionCount: number };
};
