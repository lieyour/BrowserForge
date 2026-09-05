import { chromium, type Locator, type Page } from "playwright";
import type { CandidateLocator, FieldKind } from "../contracts/skill.js";
import { RuntimeError } from "./errors.js";

export type TelemetryCounter = { fieldsFilled: number; domInspectionCount: number };

function buildLocator(page: Page, locator: CandidateLocator): Locator {
  switch (locator.strategy) {
    case "label": return page.getByLabel(locator.value, { exact: true });
    case "aria": return page.locator(`[aria-label=${JSON.stringify(locator.value)}]`);
    case "placeholder": return page.getByPlaceholder(locator.value, { exact: true });
    case "testid": return page.getByTestId(locator.value);
    case "role": return page.getByRole(locator.value as any);
    case "css": return page.locator(locator.value);
  }
}

async function find(page: Page, locators: CandidateLocator[], counter: TelemetryCounter, field: string): Promise<Locator> {
  for (const candidate of locators) {
    const locator = buildLocator(page, candidate);
    counter.domInspectionCount += 1;
    if (await locator.count()) return locator.first();
  }
  throw new RuntimeError("FIELD_NOT_FOUND", `Could not find field: ${field}`, field, true);
}

async function choice(page: Page, locators: CandidateLocator[], value: string, type: "radio" | "checkbox", counter: TelemetryCounter, field: string): Promise<Locator> {
  const control = await find(page, locators, counter, field);
  const name = await control.getAttribute("name");
  const controls = page.locator(`input[type=${type}]`);
  const count = await controls.count();
  counter.domInspectionCount += 1;
  for (let index = 0; index < count; index += 1) {
    const item = controls.nth(index);
    if ((await item.getAttribute("name")) === name && (await item.getAttribute("value")) === value) return item;
  }
  throw new RuntimeError("FIELD_NOT_FOUND", `Could not find option ${value} for ${field}`, field, true);
}

export function createHelpers(page: Page, counter: TelemetryCounter) {
  return {
    async fill(field: { name: string; kind: FieldKind; locators: CandidateLocator[] }, value: unknown) {
      const locator = await find(page, field.locators, counter, field.name);
      if (field.kind === "select") {
        await locator.selectOption({ label: String(value) });
      } else {
        await locator.fill(String(value));
      }
      const actual = await locator.inputValue();
      if (actual !== String(value)) throw new RuntimeError("FIELD_VALUE_MISMATCH", `Value was not applied to ${field.name}`, field.name, true);
      counter.fieldsFilled += 1;
    },
    async choose(field: { name: string; kind: "radio" | "checkbox"; locators: CandidateLocator[] }, value: string | string[]) {
      const values = Array.isArray(value) ? value : [value];
      for (const option of values) {
        const locator = await choice(page, field.locators, option, field.kind, counter, field.name);
        await locator.check();
        if (!(await locator.isChecked())) throw new RuntimeError("FIELD_VALUE_MISMATCH", `Option was not applied to ${field.name}`, field.name, true);
      }
      counter.fieldsFilled += 1;
    },
    async submit(submit: { label: string; locators: CandidateLocator[] }) {
      const locator = await find(page, submit.locators, counter, "submit");
      await locator.click();
    },
    async confirm(evidence: CandidateLocator[]) {
      for (const candidate of evidence) {
        const locator = buildLocator(page, candidate);
        counter.domInspectionCount += 1;
        if (await locator.isVisible({ timeout: 2_000 }).catch(() => false)) return;
      }
      throw new RuntimeError("SUCCESS_NOT_CONFIRMED", "Submission finished but success evidence was not found", undefined, true);
    }
  };
}

export async function withPage<T>(callback: (page: Page) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try { return await callback(page); } finally { await context.close(); await browser.close(); }
}
