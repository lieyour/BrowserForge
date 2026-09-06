import { chromium, type Page } from "playwright";
import type { PageSnapshot } from "./responsesClient.js";

export const flowOptions = { pageTimeoutMs: 15_000, spaNavigationWaitMs: 1_000 };

type NavigationControl = { index: number; tag: string; text: string; label: string; type?: string; role?: string; disabled: boolean; inForm: boolean; hasPopup: boolean };
type ExtractedPage = PageSnapshot & { links: Array<{ href: string; text: string }>; navigationControls: NavigationControl[] };
type QueuedPage = { url: string; depth: number; snapshot?: ExtractedPage };
export type FlowPage = PageSnapshot & { depth: number };
export type FlowResult = { pages: FlowPage[]; spaRoutes: number; skipped: Array<{ url: string; reason: string }> };

const pageSnapshotScript = String.raw`(() => {
  function compact(value, limit) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit); }
  function selector(element) {
    if (element.id) return "#" + CSS.escape(element.id);
    if (element.getAttribute("data-testid")) return "[data-testid=" + JSON.stringify(element.getAttribute("data-testid")) + "]";
    if (element.getAttribute("aria-label")) return element.tagName.toLowerCase() + "[aria-label=" + JSON.stringify(element.getAttribute("aria-label")) + "]";
    return element.tagName.toLowerCase();
  }
  return {
    title: document.title,
    visibleText: compact(document.body && document.body.innerText, 20000),
    elements: Array.from(document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="link"], [contenteditable="true"]')).filter(function(element) {
      var style = getComputedStyle(element); return style.display !== "none" && style.visibility !== "hidden";
    }).slice(0, 300).map(function(element) {
      return { tag: element.tagName.toLowerCase(), type: element.getAttribute("type") || undefined, text: compact(element.textContent || element.value, 160), selector: selector(element), label: compact(element.getAttribute("aria-label") || element.getAttribute("placeholder"), 160), name: element.getAttribute("name") || undefined, role: element.getAttribute("role") || undefined, ariaLabel: element.getAttribute("aria-label") || undefined, placeholder: element.getAttribute("placeholder") || undefined, required: element.hasAttribute("required") };
    }),
    links: Array.from(document.querySelectorAll("a[href]")).map(function(link) { return { href: link.href, text: compact(link.textContent || link.getAttribute("aria-label"), 120) }; }).filter(function(link) { return link.href; }).slice(0, 500),
    navigationControls: Array.from(document.querySelectorAll('button, [role="link"], [role="button"]')).map(function(element, index) {
      var style = getComputedStyle(element);
      return { index: index, tag: element.tagName.toLowerCase(), text: compact(element.textContent || element.getAttribute("aria-label"), 120), label: compact(element.getAttribute("aria-label") || element.getAttribute("title"), 120), type: element.getAttribute("type") || undefined, role: element.getAttribute("role") || undefined, disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true", inForm: !!element.closest("form"), hasPopup: !!element.getAttribute("aria-haspopup"), visible: style.display !== "none" && style.visibility !== "hidden" };
    }).filter(function(control) { return control.visible; })
  };
})()`;

const unsafeNavigation = /(login|log[ -]?in|logout|sign[ -]?out|delete|remove|destroy|cancel|checkout|purchase|buy|payment|billing|unsubscribe|save|submit|send|create|update|登录|保存|提交|删除|取消|退出|购买|支付|创建|更新)/i;
const navigationControlSelector = 'button, [role="link"], [role="button"]';

function canonical(url: string) {
  const parsed = new URL(url);
  if (!/^#!?\//.test(parsed.hash)) parsed.hash = "";
  for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) parsed.searchParams.delete(key);
  return parsed.href;
}

function pageSignature(snapshot: PageSnapshot) {
  return `${snapshot.title.toLowerCase()}|${snapshot.visibleText.slice(0, 500).toLowerCase()}|${snapshot.elements.slice(0, 12).map((item) => `${item.tag}:${item.text}`).join("|").toLowerCase()}`;
}

function safeLinks(pageUrl: string, origin: string, links: Array<{ href: string; text: string }>) {
  return links.flatMap((link) => {
    try {
      const target = new URL(link.href, pageUrl);
      const fullText = `${target.pathname} ${link.text}`;
      if (target.origin !== origin || !["http:", "https:"].includes(target.protocol) || unsafeNavigation.test(fullText)) return [];
      return [canonical(target.href)];
    } catch { return []; }
  });
}

async function extract(page: Page): Promise<ExtractedPage> {
  const extracted = await page.evaluate(pageSnapshotScript) as Omit<ExtractedPage, "url">;
  return { ...extracted, url: page.url() };
}

function safeNavigationControls(controls: NavigationControl[]) {
  return controls.filter((control) => !control.disabled && !control.inForm && !control.hasPopup && !["submit", "reset"].includes(control.type ?? "") && !unsafeNavigation.test(`${control.text} ${control.label}`));
}

async function discoverSpaRoutes(page: Page, source: ExtractedPage, origin: string, options: typeof flowOptions, skipped: FlowResult["skipped"]): Promise<QueuedPage[]> {
  const routes: QueuedPage[] = [];
  for (const control of safeNavigationControls(source.navigationControls)) {
    try {
      await page.goto(source.url, { waitUntil: "domcontentloaded", timeout: options.pageTimeoutMs });
      const before = canonical(page.url());
      await page.locator(navigationControlSelector).nth(control.index).click({ timeout: options.pageTimeoutMs });
      await page.waitForFunction((url) => window.location.href !== url, before, { timeout: options.spaNavigationWaitMs }).catch(() => undefined);
      const target = await extract(page);
      const targetUrl = canonical(target.url);
      if (targetUrl === before) {
        skipped.push({ url: source.url, reason: `button \"${control.text || control.label || control.tag}\" did not navigate` });
        continue;
      }
      const parsed = new URL(targetUrl);
      if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) || unsafeNavigation.test(`${parsed.pathname} ${control.text} ${control.label}`)) {
        skipped.push({ url: targetUrl, reason: "button navigation was outside the safe same-origin scope" });
        continue;
      }
      routes.push({ url: targetUrl, depth: 1, snapshot: target });
    } catch (error) {
      skipped.push({ url: source.url, reason: `button \"${control.text || control.label || control.tag}\": ${error instanceof Error ? error.message.slice(0, 180) : "navigation failed"}` });
    }
  }
  return routes;
}

export async function exploreSiteFlow(startUrl: string, options: Partial<typeof flowOptions> = {}): Promise<FlowResult> {
  const configuredOptions = { ...flowOptions, ...options };
  const start = canonical(startUrl);
  const origin = new URL(start).origin;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const queued: QueuedPage[] = [{ url: start, depth: 0 }];
  const visited = new Set<string>();
  const signatures = new Set<string>();
  const pages: FlowPage[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  let spaRoutes = 0;
  try {
    while (queued.length) {
      const next = queued.shift()!;
      if (visited.has(next.url)) continue;
      visited.add(next.url);
      try {
        let extracted = next.snapshot;
        if (!extracted) {
          await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: configuredOptions.pageTimeoutMs });
          extracted = await extract(page);
        }
        const snapshot: PageSnapshot = { url: extracted.url, title: extracted.title, visibleText: extracted.visibleText, elements: extracted.elements };
        const signature = pageSignature(snapshot);
        if (signatures.has(signature)) { skipped.push({ url: next.url, reason: "duplicate page structure" }); continue; }
        signatures.add(signature);
        pages.push({ ...snapshot, depth: next.depth });
        for (const url of safeLinks(snapshot.url, origin, extracted.links)) if (!visited.has(url) && !queued.some((item) => item.url === url)) queued.push({ url, depth: next.depth + 1 });
        if (next.depth === 0) {
          const routes = await discoverSpaRoutes(page, extracted, origin, configuredOptions, skipped);
          spaRoutes += routes.length;
          for (const route of routes) if (!visited.has(route.url) && !queued.some((item) => item.url === route.url)) queued.push(route);
        }
      } catch (error) {
        skipped.push({ url: next.url, reason: error instanceof Error ? error.message.slice(0, 180) : "navigation failed" });
      }
    }
    return { pages, spaRoutes, skipped };
  } finally { await browser.close(); }
}
