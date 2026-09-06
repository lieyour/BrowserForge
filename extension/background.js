const localService = "http://127.0.0.1:8787";
const unsafeNavigation = /(login|log[ -]?in|logout|sign[ -]?out|delete|remove|destroy|cancel|checkout|purchase|buy|payment|billing|unsubscribe|save|submit|send|create|update|登录|保存|提交|删除|取消|退出|购买|支付|创建|更新)/i;

function sleep(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function canonical(url) { const parsed = new URL(url); if (!/^#!?\//.test(parsed.hash)) parsed.hash = ""; for (const key of [...parsed.searchParams.keys()]) if (/^(utm_|ref$|source$)/i.test(key)) parsed.searchParams.delete(key); return parsed.href; }
function safeLinks(pageUrl, origin, links) { return links.flatMap((link) => { try { const target = new URL(link.href, pageUrl); return target.origin === origin && ["http:", "https:"].includes(target.protocol) && !unsafeNavigation.test(`${target.pathname} ${link.text}`) ? [canonical(target.href)] : []; } catch { return []; } }); }
function safeControls(controls) { return controls.filter((control) => control.visible && !control.disabled && !control.inForm && !control.hasPopup && !["submit", "reset"].includes(control.type || "") && !unsafeNavigation.test(`${control.text} ${control.label}`)); }
async function tab(tabId) { return chrome.tabs.get(tabId); }
async function waitFor(tabId, predicate, timeout = 15_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { const current = await tab(tabId); if (predicate(current)) return current; await sleep(100); } throw new Error("Timed out waiting for the browser tab"); }
async function navigate(tabId, url) { await chrome.tabs.update(tabId, { url }); return waitFor(tabId, (current) => current.status === "complete"); }
async function inject(tabId) { await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] }); }
async function capture(tabId) { await inject(tabId); return chrome.tabs.sendMessage(tabId, { type: "BROWSING_SKILLS_FLOW_SNAPSHOT" }); }
async function clickControl(tabId, index) { await inject(tabId); const result = await chrome.tabs.sendMessage(tabId, { type: "BROWSING_SKILLS_FLOW_CLICK", index }); if (!result?.ok) throw new Error(result?.error || "Could not click navigation control"); }
async function waitForUrlChange(tabId, before, timeout = 1_000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { const current = await tab(tabId); if (current.url && canonical(current.url) !== canonical(before)) { if (current.status !== "complete") await waitFor(tabId, (next) => next.status === "complete"); await sleep(100); return current.url; } await sleep(50); } return undefined; }
async function generate(snapshot) { const response = await fetch(`${localService}/api/generate`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot) }); const payload = await response.json(); if (!response.ok) throw new Error(payload.error || "Local BrowserForge service rejected the snapshot"); return payload.skill; }
function post(port, message) { chrome.storage.session.set({ browserForgeFlowStatus: message }); try { port.postMessage(message); } catch {} }

function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }

async function bridgeRequest(path, body) {
  const response = await fetch(`${localService}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "BrowserForge bridge request failed");
  return payload;
}

async function runBridgeCommand(command) {
  const messageType = command.type === "run-read-action" ? "BROWSERFORGE_RUN_READ_ACTION" : command.type === "run-write-action" ? "BROWSERFORGE_RUN_WRITE_ACTION" : undefined;
  if (!messageType) throw new Error(`Unknown BrowserForge bridge command: ${command.type}`);
  const [current] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!current?.id || !current.url || !/^https?:/.test(current.url)) throw new Error("No active HTTP(S) tab is available for BrowserForge");
  await chrome.scripting.executeScript({ target: { tabId: current.id }, files: ["content.js"] });
  return chrome.tabs.sendMessage(current.id, { type: messageType, command });
}

async function keepBridgeConnected() {
  while (true) {
    try {
      const command = await bridgeRequest("/api/bridge/poll", {});
      if (command.type !== "idle") {
        let result;
        try { result = await runBridgeCommand(command); } catch (error) { result = { ok: false, error: { code: "BRIDGE_FAILED", message: error instanceof Error ? error.message : String(error) } }; }
        if (typeof command.taskId === "string") await bridgeRequest("/api/bridge/result", { taskId: command.taskId, ...result });
      } else await delay(1_000);
    } catch { await delay(2_000); }
  }
}

void keepBridgeConnected();

async function exploreFlow({ tabId, startUrl }, port) {
  const start = canonical(startUrl); const origin = new URL(start).origin; const queued = [{ url: start, depth: 0 }]; const visited = new Set(); const skipped = []; const added = new Set(); const updated = new Set(); let spaRoutes = 0;
  post(port, { type: "progress", phase: `Reading ${new URL(start).pathname || "/"}`, visited: 0, spaRoutes: 0, skipped: 0, added: [], updated: [] });
  try {
    while (queued.length) {
      const next = queued.shift(); if (visited.has(next.url)) continue; visited.add(next.url);
      try {
        let observed = next.observed;
        if (!observed) { const current = await tab(tabId); if (!current.url || canonical(current.url) !== next.url) await navigate(tabId, next.url); observed = await capture(tabId); }
        const pageUrl = canonical(observed.snapshot.url);
        if (new URL(pageUrl).origin !== origin) { skipped.push({ url: observed.snapshot.url, reason: "redirected outside the same-origin scope" }); continue; }
        post(port, { type: "progress", phase: `Generating actions for ${new URL(pageUrl).pathname || "/"}`, visited: visited.size, spaRoutes, skipped: skipped.length, added: [...added], updated: [...updated] });
        const skill = await generate({ ...observed.snapshot, url: pageUrl }); skill.added.forEach((action) => added.add(action)); skill.updated.forEach((action) => updated.add(action));
        for (const url of safeLinks(pageUrl, origin, observed.links)) if (!visited.has(url) && !queued.some((item) => item.url === url)) queued.push({ url, depth: next.depth + 1 });
        if (next.depth === 0) for (const control of safeControls(observed.navigationControls)) {
          try { await navigate(tabId, pageUrl); await clickControl(tabId, control.index); const targetUrl = await waitForUrlChange(tabId, pageUrl); if (!targetUrl) { skipped.push({ url: pageUrl, reason: `button \"${control.text || control.label || control.tag}\" did not navigate` }); continue; } const target = await capture(tabId); const normalizedTargetUrl = canonical(target.snapshot.url); const parsed = new URL(normalizedTargetUrl); if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) || unsafeNavigation.test(`${parsed.pathname} ${control.text} ${control.label}`)) { skipped.push({ url: normalizedTargetUrl, reason: "button navigation was outside the safe same-origin scope" }); continue; } spaRoutes++; if (!visited.has(normalizedTargetUrl) && !queued.some((item) => item.url === normalizedTargetUrl)) queued.push({ url: normalizedTargetUrl, depth: 1, observed: target }); } catch (error) { skipped.push({ url: pageUrl, reason: `button \"${control.text || control.label || control.tag}\": ${error instanceof Error ? error.message : String(error)}` }); }
        }
      } catch (error) { skipped.push({ url: next.url, reason: error instanceof Error ? error.message : String(error) }); }
      post(port, { type: "progress", visited: visited.size, spaRoutes, skipped: skipped.length, added: [...added], updated: [...updated] });
    }
    post(port, { type: "complete", visited: visited.size, spaRoutes, skipped, added: [...added], updated: [...updated] });
  } finally { try { const current = await tab(tabId); if (current.url && canonical(current.url) !== start) await navigate(tabId, startUrl); } catch {} }
}

chrome.runtime.onConnect.addListener((port) => { if (port.name !== "browserforge-flow") return; port.onMessage.addListener((message) => { if (message?.type === "start-flow") void exploreFlow(message, port).catch((error) => post(port, { type: "error", error: error instanceof Error ? error.message : String(error) })); }); });
