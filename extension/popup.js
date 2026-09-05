const createButton = document.querySelector("#create");
const status = document.querySelector("#status");
const pageUrl = document.querySelector("#page-url");
const modeSelect = document.querySelector("#mode");
let currentTab;

function show(message, className = "") {
  status.textContent = message;
  status.className = className;
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
    let endpoint;
    let requestBody;
    if (mode === "flow") {
      show("Exploring same-domain pages…");
      endpoint = "http://127.0.0.1:8787/api/generate-flow";
      requestBody = { startUrl: currentTab.url };
    } else {
      show("Capturing page context…");
      await chrome.scripting.executeScript({ target: { tabId: currentTab.id }, files: ["content.js"] });
      requestBody = await chrome.tabs.sendMessage(currentTab.id, { type: "BROWSING_SKILLS_SNAPSHOT", url: currentTab.url });
      requestBody.screenshot = await chrome.tabs.captureVisibleTab(currentTab.windowId, { format: "jpeg", quality: 55 });
      endpoint = "http://127.0.0.1:8787/api/generate";
    }
    show(mode === "flow" ? "Generating actions for the explored pages…" : "Generating Skill with AI…");
    const response = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(requestBody) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Local BrowserForge service rejected the request");
    const changes = [...payload.skill.added.map((action) => `Added ${action}`), ...payload.skill.updated.map((action) => `Updated ${action}`)];
    if (mode === "flow") changes.unshift(`Visited ${payload.flow.visited} pages`);
    show(changes.length ? changes.join(" · ") : "Skill already covers this page", "success");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    show(/fetch failed|failed to fetch/i.test(message) ? "Cannot reach the local service. Reload this extension to grant localhost access, then confirm npm run serve is running." : message, "error");
  } finally { createButton.disabled = false; }
}

(async () => {
  try {
    currentTab = await activeTab();
    pageUrl.textContent = currentTab.url;
    createButton.addEventListener("click", createSkill);
  } catch (error) {
    pageUrl.textContent = error.message;
    createButton.disabled = true;
  }
})();
