if (!globalThis.__browserForgeContentReady) {
  globalThis.__browserForgeContentReady = true;

  function compact(value, limit) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit); }

  function selector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (element.getAttribute("data-testid")) return `[data-testid=${JSON.stringify(element.getAttribute("data-testid"))}]`;
    if (element.getAttribute("aria-label")) return `${element.tagName.toLowerCase()}[aria-label=${JSON.stringify(element.getAttribute("aria-label"))}]`;
    var parts = [];
    var node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && parts.length < 5) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      var siblings = Array.from(node.parentElement?.children || []).filter((item) => item.tagName === node.tagName);
      parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(node) + 1})`);
      node = node.parentElement;
    }
    return parts.join(" > ");
  }

  function labelFor(element) {
    var linked = element.id ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`) : null;
    return compact(linked?.textContent || element.closest("label")?.textContent || element.getAttribute("aria-label") || element.getAttribute("placeholder"), 160);
  }

  function optionsFor(element) {
    if (element instanceof HTMLSelectElement) return Array.from(element.options).map((option) => compact(option.textContent, 80)).filter(Boolean).slice(0, 30);
    return undefined;
  }

  function snapshot(url) {
    var elements = Array.from(document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="link"], [contenteditable="true"]'))
      .filter((element) => {
        var style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .slice(0, 300)
      .map((element) => ({
        tag: element.tagName.toLowerCase(), type: element.getAttribute("type") || undefined, text: compact(element.textContent || (element instanceof HTMLInputElement ? element.value : ""), 160),
        selector: selector(element), label: labelFor(element), name: element.getAttribute("name") || undefined,
        role: element.getAttribute("role") || undefined, ariaLabel: element.getAttribute("aria-label") || undefined,
        placeholder: element.getAttribute("placeholder") || undefined, required: element.hasAttribute("required"), options: optionsFor(element)
      }));
    return { url, title: document.title, visibleText: compact(document.body?.innerText, 20_000), elements };
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BROWSING_SKILLS_SNAPSHOT") sendResponse(snapshot(message.url));
  });
}
