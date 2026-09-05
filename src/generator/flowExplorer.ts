import { chromium, type Page } from "playwright";
import type { PageSnapshot } from "./responsesClient.js";

export const flowLimits = { maxPages: 30, maxDepth: 3, timeoutMs: 8 * 60_000, pageTimeoutMs: 15_000 };

type QueuedPage = { url: string; depth: number };
export type FlowPage = PageSnapshot & { depth: number };
export type FlowResult = { pages: FlowPage[]; skipped: Array<{ url: string; reason: string }> };

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
    links: Array.from(document.querySelectorAll("a[href]")).map(function(link) { return { href: link.href, text: compact(link.textContent || link.getAttribute("aria-label"), 120) }; }).filter(function(link) { return link.href; }).slice(0, 500)
  };
})()`;

const unsafeLink = /(?:^|[\s/_-])(logout|sign[ -]?out|delete|remove|destroy|cancel|checkout|purchase|buy|payment|billing|unsubscribe)(?:$|[\s/_-])/i;

function canonical(url: string) {
  const parsed = new URL(url);
  parsed.hash = "";
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
      if (target.origin !== origin || !["http:", "https:"].includes(target.protocol) || unsafeLink.test(fullText)) return [];
      return [canonical(target.href)];
    } catch { return []; }
  });
}

async function extract(page: Page): Promise<PageSnapshot & { links: Array<{ href: string; text: string }> }> {
  return page.evaluate(pageSnapshotScript) as Promise<PageSnapshot & { links: Array<{ href: string; text: string }> }>;
}

export async function exploreSiteFlow(startUrl: string, limits = flowLimits): Promise<FlowResult> {
  const start = canonical(startUrl);
  const origin = new URL(start).origin;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const queued: QueuedPage[] = [{ url: start, depth: 0 }];
  const visited = new Set<string>();
  const signatures = new Set<string>();
  const pages: FlowPage[] = [];
  const skipped: Array<{ url: string; reason: string }> = [];
  const deadline = Date.now() + limits.timeoutMs;
  try {
    while (queued.length && pages.length < limits.maxPages && Date.now() < deadline) {
      const next = queued.shift()!;
      if (visited.has(next.url)) continue;
      visited.add(next.url);
      try {
        await page.goto(next.url, { waitUntil: "domcontentloaded", timeout: limits.pageTimeoutMs });
        const extracted = await extract(page);
        const snapshot: PageSnapshot = { url: page.url(), title: extracted.title, visibleText: extracted.visibleText, elements: extracted.elements };
        const signature = pageSignature(snapshot);
        if (signatures.has(signature)) { skipped.push({ url: next.url, reason: "duplicate page structure" }); continue; }
        signatures.add(signature);
        pages.push({ ...snapshot, depth: next.depth });
        if (next.depth >= limits.maxDepth) continue;
        for (const url of safeLinks(page.url(), origin, extracted.links)) if (!visited.has(url) && !queued.some((item) => item.url === url)) queued.push({ url, depth: next.depth + 1 });
      } catch (error) {
        skipped.push({ url: next.url, reason: error instanceof Error ? error.message.slice(0, 180) : "navigation failed" });
      }
    }
    if (Date.now() >= deadline) skipped.push({ url: start, reason: "flow time limit reached" });
    return { pages, skipped };
  } finally { await browser.close(); }
}
