const createButton = document.querySelector("#create");
const status = document.querySelector("#status");
const pageUrl = document.querySelector("#page-url");
const modeSelect = document.querySelector("#mode");
let currentTab;

function show(message, className = "") {
  status.textContent = message;
  status.className = className;
}

function showFlowStatus(message) {
  if (message?.type === "progress") show(message.phase || `Visited ${message.visited} pages · SPA routes ${message.spaRoutes} · Skipped ${message.skipped}`);
  if (message?.type === "complete") {
    const changes = [...message.added.map((action) => `Added ${action}`), ...message.updated.map((action) => `Updated ${action}`)];
    changes.unshift(`Visited ${message.visited} pages`);
    if (message.spaRoutes) changes.push(`Discovered ${message.spaRoutes} SPA routes`);
    if (message.skipped.length) changes.push(`Skipped ${message.skipped.length}`);
    show(changes.join(" · ") || "No task-specific actions were generated", "success");
  }
  if (message?.type === "error") show(message.error, "error");
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id || !tab.url) throw new Error("No active webpage found");
  const protocol = new URL(tab.url).protocol;
  if (!["http:", "https:"].includes(protocol)) throw new Error("Open an HTTP(S) form page first");
  return tab;
}

async function createSkill() {
  try {
    createButton.disabled = true;
    const mode = modeSelect.value;
    if (mode === "flow") {
      show("Exploring the current tab session…");
      const port = chrome.runtime.connect({ name: "browserforge-flow" });
      port.onMessage.addListener((message) => {
        showFlowStatus(message);
        if (message?.type === "complete") {
          createButton.disabled = false;
        }
        if (message?.type === "error") { show(message.error, "error"); createButton.disabled = false; }
      });
      port.postMessage({ type: "start-flow", tabId: currentTab.id, startUrl: currentTab.url });
      return;
    }
    show("Capturing page context…");
    await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
    const requestBody = await chrome.tabs.sendMessage(currentTab.id, { type: "BROWSING_SKILLS_SNAPSHOT" });
    requestBody.generationMode = mode === "write" ? "write" : "read";
    requestBody.screenshot = await chrome.tabs.captureVisibleTab(currentTab.windowId, { format: "jpeg", quality: 55 });
    show("Generating Skill with AI…");
    const response = await fetch("http://127.0.0.1:8787/api/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Local BrowserForge service rejected the request");
    const changes = [...payload.skill.added.map((action) => `Added ${action}`), ...payload.skill.updated.map((action) => `Updated ${action}`)];
    show(changes.length ? changes.join(" · ") : "Skill already covers this page", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show(/fetch failed|failed to fetch/i.test(message) ? "Cannot reach the local service. Reload this extension to grant localhost access, then confirm npm run serve is running." : message, "error");
  } finally { createButton.disabled = false; }
}

(async () => {
  try {
    const { browserForgeFlowStatus } = await chrome.storage.session.get("browserForgeFlowStatus");
    if (browserForgeFlowStatus) showFlowStatus(browserForgeFlowStatus);
    currentTab = await activeTab();
    pageUrl.textContent = currentTab.url;
    createButton.addEventListener("click", createSkill);
  } catch (error) {
    pageUrl.textContent = error.message;
    createButton.disabled = true;
  }
})();
