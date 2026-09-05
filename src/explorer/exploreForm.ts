import { chromium } from "playwright";
import type { CandidateLocator, FormExploration, FormField } from "../contracts/skill.js";

type RawField = Omit<FormField, "locators"> & { selector: string; ariaLabel?: string; placeholder?: string; testId?: string };

// Browser-native source: transpiler helpers in callbacks can leak into page.evaluate.
const extractionScript = String.raw`(() => {
  function text(element) { return (element && element.textContent || "").replace(/\s+/g, " ").trim(); }
  function labelFor(element) {
    const id = element.id;
    const byFor = id ? document.querySelector('label[for="' + CSS.escape(id) + '"]') : null;
    return text(byFor) || text(element.closest("label")) || element.getAttribute("aria-label") || element.getAttribute("placeholder") || element.getAttribute("name") || id;
  }
  function selector(element) {
    if (element.id) return "#" + CSS.escape(element.id);
    if (element.name) return element.tagName.toLowerCase() + "[name=" + JSON.stringify(element.name) + "]";
    return element.tagName.toLowerCase() + '[data-browserforge-index="' + Array.from(document.querySelectorAll("input,select,textarea")).indexOf(element) + '"]';
  }
  const fields = [];
  const handled = new Set();
  document.querySelectorAll("input, select, textarea").forEach((element) => {
    if (element instanceof HTMLInputElement && ["submit", "button", "reset", "hidden", "file"].includes(element.type)) return;
    const type = element instanceof HTMLInputElement ? element.type : element instanceof HTMLSelectElement ? "select" : "textarea";
    const kind = ["email", "tel", "date", "radio", "checkbox"].includes(type) ? type : type === "select" || type === "textarea" ? type : "text";
    const key = kind === "radio" || kind === "checkbox" ? kind + ":" + (element.getAttribute("name") || element.id) : "single:" + selector(element);
    if (handled.has(key)) return;
    handled.add(key);
    const grouped = kind === "radio" || kind === "checkbox";
    const controls = grouped ? Array.from(document.querySelectorAll('input[type="' + kind + '"]')).filter((input) => input.name === element.name) : [element];
    const options = kind === "select" ? Array.from(element.options).filter((option) => option.value).map((option) => option.text.trim()) : grouped ? controls.map((input) => input.value) : undefined;
    fields.push({ name: element.getAttribute("name") || element.id || "field_" + (fields.length + 1), label: labelFor(element), kind, required: controls.some((control) => control.required), options, selector: selector(element), ariaLabel: element.getAttribute("aria-label") || undefined, placeholder: element.getAttribute("placeholder") || undefined, testId: element.getAttribute("data-testid") || undefined });
  });
  function submitControl() {
    const explicit = document.querySelector('button[type="submit"], input[type="submit"]');
    if (explicit) return explicit;
    const defaultFormButton = document.querySelector("form button:not([type])");
    if (defaultFormButton) return defaultFormButton;
    const submitWords = /^(submit|save|send|continue|next|register|sign up|create|apply|confirm|提交|保存|发送|下一步|注册|确认)$/i;
    return Array.from(document.querySelectorAll('button, input[type="button"], [role="button"]')).find((element) => submitWords.test(text(element) || element.value || element.getAttribute("aria-label") || ""));
  }
  function submitSelector(button) {
    if (button.id) return "#" + CSS.escape(button.id);
    if (button.getAttribute("data-testid")) return "[data-testid=" + JSON.stringify(button.getAttribute("data-testid")) + "]";
    if (button.matches('button[type="submit"]')) return 'button[type="submit"]';
    if (button.matches('input[type="submit"]')) return 'input[type="submit"]';
    if (button.matches("form button:not([type])")) return "form button:not([type])";
    if (button.getAttribute("aria-label")) return "[aria-label=" + JSON.stringify(button.getAttribute("aria-label")) + "]";
    return '[role="button"]';
  }
  const button = submitControl();
  const submit = button ? { label: text(button) || button.getAttribute("value") || "Submit", selector: submitSelector(button), testId: button.getAttribute("data-testid") || undefined } : null;
  const success = Array.from(document.querySelectorAll('[data-testid*="success" i], [role="alert"], [role="dialog"]')).map((element) => element.getAttribute("data-testid") ? { strategy: "testid", value: element.getAttribute("data-testid") } : { strategy: "css", value: '[role="' + element.getAttribute("role") + '"]' });
  return { title: document.title, fields, submit, success };
})()`;

function locators(field: RawField): CandidateLocator[] {
  const result: CandidateLocator[] = [];
  if (field.label) result.push({ strategy: "label", value: field.label });
  if (field.ariaLabel) result.push({ strategy: "aria", value: field.ariaLabel });
  if (field.placeholder) result.push({ strategy: "placeholder", value: field.placeholder });
  if (field.testId) result.push({ strategy: "testid", value: field.testId });
  result.push({ strategy: "css", value: field.selector });
  return result;
}

export async function exploreForm(sourceUrl: string): Promise<FormExploration> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const snapshot = await page.evaluate(extractionScript) as { title: string; fields: RawField[]; submit: { label: string; selector: string; testId?: string } | null; success: CandidateLocator[] };
    if (!snapshot.submit) throw new Error("No submit control found on page");
    return {
      sourceUrl: page.url(), origin: new URL(page.url()).origin, title: snapshot.title,
      fields: snapshot.fields.map((field) => ({ ...field, locators: locators(field) })),
      submit: { label: snapshot.submit.label, locators: [ ...(snapshot.submit.testId ? [{ strategy: "testid" as const, value: snapshot.submit.testId }] : []), { strategy: "css", value: snapshot.submit.selector } ] },
      successEvidence: snapshot.success.length ? snapshot.success : [{ strategy: "css", value: '[role="dialog"]' }],
      risk: "write"
    };
  } finally { await browser.close(); }
}
