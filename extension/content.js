if (!globalThis.__browserForgeContentReady) {
  globalThis.__browserForgeContentReady = true;

  function compact(value, limit) { return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit); }

  function selector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;
    if (element.getAttribute("data-testid")) return `[data-testid=${JSON.stringify(element.getAttribute("data-testid"))}]`;
    if (element.getAttribute("aria-label")) return `${element.tagName.toLowerCase()}[aria-label=${JSON.stringify(element.getAttribute("aria-label"))}]`;
    var parts = [];
    var node = element;
    while (node && node.nodeType === Node.ELEMENT_NODE && node !== document.documentElement) {
      if (node.id) { parts.unshift(`#${CSS.escape(node.id)}`); break; }
      var classes = Array.from(node.classList || []).filter((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name)).slice(0, 3);
      var segment = node.tagName.toLowerCase() + classes.map((name) => `.${CSS.escape(name)}`).join("");
      var siblings = Array.from(node.parentElement?.children || []).filter((item) => item.tagName === node.tagName && classes.every((name) => item.classList.contains(name)));
      if (siblings.length > 1) segment += `:nth-of-type(${Array.from(node.parentElement?.children || []).filter((item) => item.tagName === node.tagName).indexOf(node) + 1})`;
      parts.unshift(segment);
      var candidate = parts.join(" > ");
      try { if (document.querySelectorAll(candidate).length === 1) return candidate; } catch {}
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
    var interactive = Array.from(document.querySelectorAll('input, textarea, select, button, a[href], [role="button"], [role="link"], [contenteditable="true"]'))
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
    var tables = Array.from(document.querySelectorAll("table")).filter((table) => {
      var style = getComputedStyle(table);
      return style.display !== "none" && style.visibility !== "hidden";
    }).slice(0, 30).map((table) => ({
      tag: "table", role: "table", selector: selector(table),
      headers: Array.from(table.querySelectorAll("thead th")).map((header) => compact(header.textContent, 80)).filter(Boolean).slice(0, 30),
      rowCount: table.querySelectorAll("tbody tr").length,
      columnCount: table.querySelector("tbody tr")?.querySelectorAll("td").length || table.querySelectorAll("thead th").length
    }));
    var elements = interactive.concat(tables).slice(0, 300);
    return { url, title: document.title, visibleText: compact(document.body?.innerText, 20_000), elements };
  }

  function navigationElements() {
    return Array.from(document.querySelectorAll('button, [role="link"], [role="button"]'));
  }

  function flowSnapshot() {
    return {
      snapshot: snapshot(location.href),
      links: Array.from(document.querySelectorAll("a[href]")).filter((link) => {
        var style = getComputedStyle(link);
        return style.display !== "none" && style.visibility !== "hidden";
      }).map((link) => ({ href: link.href, text: compact(link.textContent || link.getAttribute("aria-label"), 120) })).filter((link) => link.href).slice(0, 500),
      navigationControls: navigationElements().map((element, index) => {
        var style = getComputedStyle(element);
        return { index, tag: element.tagName.toLowerCase(), text: compact(element.textContent || element.getAttribute("aria-label"), 120), label: compact(element.getAttribute("aria-label") || element.getAttribute("title"), 120), type: element.getAttribute("type") || undefined, role: element.getAttribute("role") || undefined, disabled: element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true", inForm: !!element.closest("form"), hasPopup: !!element.getAttribute("aria-haspopup"), visible: style.display !== "none" && style.visibility !== "hidden" };
      }).filter((control) => control.visible)
    };
  }

  function clickNavigationControl(index) {
    var element = navigationElements()[index];
    if (!element) throw new Error("Navigation control is no longer present");
    element.click();
    return { url: location.href };
  }

  function validateInput(schema, input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new Error("Action input must be an object");
    var properties = schema.properties || {};
    if (schema.additionalProperties === false && Object.keys(input).some(function(key) { return !(key in properties); })) throw new Error("Action input contains an unknown field");
    (schema.required || []).forEach(function(name) { if (input[name] === undefined) throw new Error("Action input is missing " + name); });
    Object.keys(properties).forEach(function(name) {
      var definition = properties[name]; var item = input[name];
      if (item === undefined || !definition.type) return;
      var actual = Array.isArray(item) ? "array" : item === null ? "null" : typeof item;
      if (definition.type === "integer" ? !Number.isInteger(item) : actual !== definition.type) throw new Error("Action input " + name + " must be " + definition.type);
      if (definition.enum && definition.enum.indexOf(item) < 0) throw new Error("Action input " + name + " is not an allowed value");
      if (typeof item === "string") {
        if (definition.minLength !== undefined && item.length < definition.minLength) throw new Error("Action input " + name + " is too short");
        if (definition.maxLength !== undefined && item.length > definition.maxLength) throw new Error("Action input " + name + " is too long");
        if (definition.pattern !== undefined && !new RegExp(definition.pattern).test(item)) throw new Error("Action input " + name + " has an invalid format");
      }
    });
  }

  function validateOutput(schema, value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Action result must be a JSON object");
    (schema.required || []).forEach(function(name) { if (value[name] === undefined) throw new Error("Action result is missing " + name); });
  }

  function failure(code, message) { var error = new Error(message); error.code = code; return error; }
  function onlyKeys(value, allowed) { return value && typeof value === "object" && Object.keys(value).every(function(key) { return allowed.indexOf(key) >= 0; }); }
  function safeSelector(value, root) { return typeof value === "string" && value.length > 0 && value.length <= 500 && !/[<{};]/.test(value) && !/\b(?:document|window|cookie|localStorage|sessionStorage|indexedDB|fetch)\b/i.test(value) && (!root || !/^(?:html|body|table|:root)$/i.test(value.trim())); }

  function validatePlan(plan) {
    if (!onlyKeys(plan, ["version", "rootSelector", "wait", "collection", "fields", "dedupeBy", "requireRows", "output"]) || plan.version !== 1 || !safeSelector(plan.rootSelector, true) || !onlyKeys(plan.collection, ["selector", "rowSelector"]) || !safeSelector(plan.collection.selector) || !safeSelector(plan.collection.rowSelector) || !plan.fields || !onlyKeys(plan.output, ["key", "fields"]) || typeof plan.output.key !== "string" || !plan.output.fields || plan.requireRows !== undefined && typeof plan.requireRows !== "boolean") throw failure("INVALID_PLAN", "Read action plan is invalid");
    if (plan.dedupeBy && !plan.fields[plan.dedupeBy]) throw failure("INVALID_PLAN", "Read action plan dedupeBy must reference a field");
    if (plan.wait && (!onlyKeys(plan.wait, ["selector", "timeoutMs"]) || !safeSelector(plan.wait.selector) || plan.wait.timeoutMs !== undefined && (!Number.isInteger(plan.wait.timeoutMs) || plan.wait.timeoutMs < 0 || plan.wait.timeoutMs > 30_000))) throw failure("INVALID_PLAN", "Read action wait condition is invalid");
    if (!Object.keys(plan.fields).every(function(name) { return onlyKeys(plan.fields[name], ["selector", "attribute"]) && safeSelector(plan.fields[name].selector) && (plan.fields[name].attribute === undefined || typeof plan.fields[name].attribute === "string" && !/^cookie$/i.test(plan.fields[name].attribute)); })) throw failure("INVALID_PLAN", "Read action plan fields are invalid");
    if (!Object.keys(plan.output.fields).every(function(name) { return typeof plan.output.fields[name] === "string" && !!plan.fields[plan.output.fields[name]]; })) throw failure("INVALID_PLAN", "Read action output mapping is invalid");
    try {
      document.querySelector(plan.rootSelector); document.querySelector(plan.collection.selector); document.querySelector(plan.collection.rowSelector); if (plan.wait) document.querySelector(plan.wait.selector);
      Object.keys(plan.fields).forEach(function(name) { document.querySelector(plan.fields[name].selector); });
    } catch (_) { throw failure("INVALID_PLAN", "Read action plan contains an invalid selector"); }
  }

  async function waitFor(root, selector, timeout) {
    var deadline = Date.now() + timeout;
    while (Date.now() <= deadline) { if (root.querySelector(selector)) return root.querySelector(selector); await new Promise(function(resolve) { setTimeout(resolve, 50); }); }
    return null;
  }

  async function waitForData(root, wait) {
    if (!wait) return;
    var timeout = Number.isInteger(wait.timeoutMs) ? wait.timeoutMs : 5_000;
    if (await waitFor(root, wait.selector, timeout)) return;
    throw failure("DATA_NOT_READY", "Read action data was not ready before the wait timeout");
  }

  function readField(row, spec) {
    var element = row.querySelector(spec.selector);
    if (!element) return "";
    var value = spec.attribute ? element.getAttribute(spec.attribute) : element.textContent;
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  async function runReadAction(command) {
    var expected = new URL(command.action.scope.url).href;
    if (location.origin !== command.action.scope.origin || location.href !== expected) throw failure("SCOPE_MISMATCH", "Current tab URL does not match action scope; BrowserForge will not navigate this tab");
    validateInput(command.action.inputSchema, command.input);
    var plan = command.action.plan;
    try { validatePlan(plan); } catch (error) { throw error; }
    var root = document.querySelector(plan.rootSelector);
    if (!root && plan.wait) root = await waitFor(document, plan.rootSelector, Number.isInteger(plan.wait.timeoutMs) ? plan.wait.timeoutMs : 5_000);
    if (!root) throw failure("ROOT_NOT_FOUND", "Read action root element was not found");
    await waitForData(root, plan.wait);
    var collection = root.querySelector(plan.collection.selector);
    if (!collection) throw failure("DATA_NOT_READY", "Read action collection was not found");
    var rows = Array.from(collection.querySelectorAll(plan.collection.rowSelector));
    if (plan.requireRows && rows.length === 0) throw failure("EMPTY_DATA", "Read action collection did not contain any rows");
    var seen = new Set();
    var values = rows.map(function(row) {
      var raw = {};
      Object.keys(plan.fields).forEach(function(name) { raw[name] = readField(row, plan.fields[name]); });
      var output = {};
      Object.keys(plan.output.fields).forEach(function(name) { output[name] = raw[plan.output.fields[name]]; });
      return { raw: raw, output: output };
    }).filter(function(item) {
      if (!plan.dedupeBy) return true;
      var key = item.raw[plan.dedupeBy];
      if (!key || seen.has(key)) return false;
      seen.add(key); return true;
    }).map(function(item) { return item.output; });
    var data = {};
    if (command.action.resultMetadata) { data.toolVersion = command.action.contractVersion; data.route = location.href; data.count = values.length; }
    data[plan.output.key] = values;
    validateOutput(command.action.outputSchema, data);
    var serialized = JSON.stringify(data);
    if (serialized.length > command.action.maxOutputChars) throw failure("OUTPUT_TOO_LARGE", "Action output exceeds maxOutputChars");
    return JSON.parse(serialized);
  }

  function validateWritePlan(action) {
    var plan = action.plan;
    if (action.mode !== "write" || ["create", "update", "delete", "submit"].indexOf(action.operation) < 0 || !onlyKeys(plan, ["version", "fields", "submitSelector", "successSelector", "failureSelector", "timeoutMs", "confirmText"]) || plan.version !== 1 || !plan.fields || typeof plan.fields !== "object" || Array.isArray(plan.fields)) throw failure("INVALID_PLAN", "Write action plan is invalid");
    var properties = action.inputSchema.properties || {};
    if (!Object.keys(plan.fields).every(function(name) {
      var field = plan.fields[name]; var schemaType = properties[name] && properties[name].type;
      return !!properties[name] && onlyKeys(field, ["selector", "kind"]) && safeSelector(field.selector) && ["fill", "select", "check"].indexOf(field.kind) >= 0 && (field.kind === "check" ? schemaType === "boolean" : ["string", "number", "integer"].indexOf(schemaType) >= 0);
    })) throw failure("INVALID_PLAN", "Write action fields are invalid");
    if (!safeSelector(plan.submitSelector) || !safeSelector(plan.successSelector) || plan.failureSelector !== undefined && !safeSelector(plan.failureSelector)) throw failure("INVALID_PLAN", "Write action selectors are invalid");
    var selectors = [plan.submitSelector, plan.successSelector].concat(plan.failureSelector === undefined ? [] : [plan.failureSelector]);
    if (new Set(selectors).size !== selectors.length) throw failure("INVALID_PLAN", "Write action submit and evidence selectors must be distinct");
    if (!Number.isInteger(plan.timeoutMs) || plan.timeoutMs < 100 || plan.timeoutMs > 10_000 || typeof plan.confirmText !== "string" || !plan.confirmText.trim() || plan.confirmText.length > 300) throw failure("INVALID_PLAN", "Write action timeout or confirmation text is invalid");
    try {
      selectors.forEach(function(item) { document.querySelector(item); });
      Object.keys(plan.fields).forEach(function(name) { document.querySelector(plan.fields[name].selector); });
    } catch (_) { throw failure("INVALID_PLAN", "Write action plan contains an invalid selector"); }
  }

  function writeResult(command, submitted, state, message) {
    var result = { submitted: submitted, operation: command.action.operation, state: state };
    if (message) result.message = compact(message, 300);
    validateOutput(command.action.outputSchema, result);
    var serialized = JSON.stringify(result);
    if (serialized.length > command.action.maxOutputChars) throw failure("OUTPUT_TOO_LARGE", "Action output exceeds maxOutputChars");
    return JSON.parse(serialized);
  }

  function nativeSet(element, property, value) {
    var prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    var setter = Object.getOwnPropertyDescriptor(prototype, property)?.set;
    if (!setter) throw new Error("Form control does not expose a native " + property + " setter");
    setter.call(element, value);
  }

  function dispatchFormEvents(element, includeInput) {
    if (includeInput) element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function visibleEvidence(selector) {
    return Array.from(document.querySelectorAll(selector)).find(function(element) {
      var style = getComputedStyle(element);
      return !element.hidden && style.display !== "none" && style.visibility !== "hidden" && element.getClientRects().length > 0;
    });
  }

  async function runWriteAction(command) {
    var expected = new URL(command.action.scope.url).href;
    if (location.origin !== command.action.scope.origin || location.href !== expected) throw failure("SCOPE_MISMATCH", "Current tab URL does not match action scope; BrowserForge will not navigate this tab");
    validateWritePlan(command.action);
    try { validateInput(command.action.inputSchema, command.input); } catch (error) { return writeResult(command, false, "VALIDATION_FAILED", error instanceof Error ? error.message : String(error)); }
    var plan = command.action.plan;
    var resolved = [];
    for (var name of Object.keys(plan.fields)) {
      var field = plan.fields[name]; var matches = document.querySelectorAll(field.selector);
      if (matches.length !== 1) return writeResult(command, false, "VALIDATION_FAILED", `Field ${name} selector must match exactly one element`);
      var element = matches[0]; var value = command.input[name];
      if (field.kind === "fill" && !(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) return writeResult(command, false, "VALIDATION_FAILED", `Field ${name} is not a text input`);
      if (field.kind === "select" && !(element instanceof HTMLSelectElement)) return writeResult(command, false, "VALIDATION_FAILED", `Field ${name} is not a select`);
      if (field.kind === "check" && (!(element instanceof HTMLInputElement) || element.type !== "checkbox")) return writeResult(command, false, "VALIDATION_FAILED", `Field ${name} is not a checkbox`);
      var option;
      if (field.kind === "select" && value !== undefined) {
        var wanted = String(value); var options = Array.from(element.options);
        option = options.find(function(item) { return item.value === wanted; }) || options.find(function(item) { return item.text.trim() === wanted; });
        if (!option) return writeResult(command, false, "VALIDATION_FAILED", `Field ${name} has no matching option`);
      }
      resolved.push({ name: name, field: field, element: element, value: value, option: option });
    }
    for (var item of resolved) {
      if (item.value === undefined) continue;
      if (item.field.kind === "fill") { nativeSet(item.element, "value", String(item.value)); dispatchFormEvents(item.element, true); }
      if (item.field.kind === "select") { nativeSet(item.element, "value", item.option.value); dispatchFormEvents(item.element, false); }
      if (item.field.kind === "check") { nativeSet(item.element, "checked", item.value); dispatchFormEvents(item.element, true); }
    }
    if (!window.confirm(plan.confirmText)) return writeResult(command, false, "NOT_CONFIRMED");
    var submitMatches = document.querySelectorAll(plan.submitSelector);
    if (submitMatches.length !== 1 || !(submitMatches[0] instanceof HTMLElement)) return writeResult(command, false, "VALIDATION_FAILED", "Submit selector must match exactly one clickable element");
    submitMatches[0].click();
    var deadline = Date.now() + plan.timeoutMs;
    while (Date.now() <= deadline) {
      var success = visibleEvidence(plan.successSelector);
      if (success) return writeResult(command, true, "SUCCESS");
      var failed = plan.failureSelector && visibleEvidence(plan.failureSelector);
      if (failed) return writeResult(command, true, "FAILURE", failed.textContent);
      await new Promise(function(resolve) { setTimeout(resolve, 50); });
    }
    return writeResult(command, true, "TIMEOUT");
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "BROWSING_SKILLS_SNAPSHOT") sendResponse(snapshot(location.href));
    if (message?.type === "BROWSING_SKILLS_FLOW_SNAPSHOT") sendResponse(flowSnapshot());
    if (message?.type === "BROWSING_SKILLS_FLOW_CLICK") {
      try { sendResponse({ ok: true, ...clickNavigationControl(message.index) }); } catch (error) { sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }); }
    }
    if (message?.type === "BROWSERFORGE_RUN_READ_ACTION") {
      var startedAt = Date.now();
      runReadAction(message.command).then(function(data) { sendResponse({ ok: true, data: data, durationMs: Date.now() - startedAt }); }).catch(function(error) { sendResponse({ ok: false, error: { code: error && error.code || "INVALID_PLAN", message: error instanceof Error ? error.message : String(error) } }); });
      return true;
    }
    if (message?.type === "BROWSERFORGE_RUN_WRITE_ACTION") {
      var startedAt = Date.now();
      runWriteAction(message.command).then(function(data) { sendResponse({ ok: true, data: data, durationMs: Date.now() - startedAt }); }).catch(function(error) { sendResponse({ ok: false, error: { code: error && error.code || "INVALID_PLAN", message: error instanceof Error ? error.message : String(error) } }); });
      return true;
    }
  });
}
