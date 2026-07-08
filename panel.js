(function initRequestFormatterPanel() {
  const MAX_ENTRIES = 500;
  const LARGE_PAYLOAD_CHAR_LIMIT = 100000;
  const PAYLOAD_PREVIEW_CHAR_LIMIT = 20000;
  const FALLBACK_MESSAGES = {
    appDescription: {
      en: "Format DevTools Network requests, responses, and WebSocket messages",
      zh_CN: "格式化 DevTools Network 请求、响应与 WebSocket 消息"
    },
    requestFilterPlaceholder: {
      en: "Filter by URL, method, or status",
      zh_CN: "按 URL、方法、状态过滤"
    },
    clearButton: {
      en: "Clear",
      zh_CN: "清空"
    },
    emptyStateTitle: {
      en: "Waiting for requests",
      zh_CN: "等待请求"
    },
    emptyStateDescription: {
      en: "Open Network requests on the current page, and formatted request, response, and WebSocket data will appear here.",
      zh_CN: "打开当前页面的 Network 请求后，这里会展示可格式化的 request、response 与 WebSocket 数据。"
    },
    narrowViewportTitle: {
      en: "Window too narrow",
      zh_CN: "当前窗口过窄"
    },
    narrowViewportDescription: {
      en: "Please widen the DevTools window before using Request Formatter.",
      zh_CN: "请先将 DevTools 窗口拉宽后再使用 Request Formatter。"
    },
    copyButton: {
      en: "Copy",
      zh_CN: "复制"
    },
    copyCurrentMessageButton: {
      en: "Copy current message",
      zh_CN: "复制当前消息"
    },
    copiedButton: {
      en: "Copied",
      zh_CN: "已复制"
    },
    copyFailedButton: {
      en: "Copy failed",
      zh_CN: "复制失败"
    },
    messageFilterPlaceholder: {
      en: "Filter by message content",
      zh_CN: "按消息内容过滤"
    },
    websocketSummaryAll: {
      en: "$1 messages. Keeping the latest $2 at most.",
      zh_CN: "共 $1 条消息，最多保留最近 $2 条。"
    },
    websocketSummaryFiltered: {
      en: "$1 after filtering. $2 total.",
      zh_CN: "过滤后 $1 条，原始共 $2 条。"
    },
    noMatchingMessages: {
      en: "No matching messages",
      zh_CN: "暂无匹配消息"
    },
    noMessageSelected: {
      en: "No message selected",
      zh_CN: "未选中消息"
    },
    noMatchingRequests: {
      en: "No matching requests",
      zh_CN: "暂无匹配请求"
    },
    devtoolsUnavailable: {
      en: "The current page is not running in a Chrome DevTools Extension environment. Load the unpacked extension and open DevTools to use it.",
      zh_CN: "当前页面不在 Chrome DevTools Extension 环境中，请以未打包扩展加载后打开 DevTools 使用。"
    },
    websocketUnavailable: {
      en: "WebSocket message capture cannot be enabled in the current environment.",
      zh_CN: "当前环境无法启用 WebSocket 消息捕获。"
    },
    websocketEnabled: {
      en: "WebSocket message capture is enabled. Chrome may show a debugging notice at the top of the page.",
      zh_CN: "WebSocket 消息捕获已启用。Chrome 可能会在页面顶部显示调试提示。"
    },
    websocketEnableFailed: {
      en: "Failed to enable WebSocket message capture: $1",
      zh_CN: "WebSocket 消息捕获启用失败：$1"
    },
    websocketNotConnected: {
      en: "WebSocket debugging is not connected.",
      zh_CN: "WebSocket 调试未处于连接状态。"
    },
    websocketDisconnected: {
      en: "WebSocket debugging connection disconnected.",
      zh_CN: "WebSocket 调试连接已断开。"
    },
    websocketDisconnectedWithReason: {
      en: "WebSocket debugging connection disconnected: $1",
      zh_CN: "WebSocket 调试连接已断开：$1"
    }
  };
  const state = {
    entries: [],
    selectedId: null,
    filterText: "",
    captureEnabled: true,
    activeTabs: {
      http: "all",
      websocket: "overview"
    },
    listItemMap: new Map(),
    httpCaptureBound: false,
    ...window.RequestFormatterWebSocket.createState({
      inspectedTabId: window.chrome?.devtools?.inspectedWindow?.tabId ?? null
    })
  };

  const dom = {
    allQueryOutput: document.getElementById("all-query-output"),
    allRequestBodyOutput: document.getElementById("all-request-body-output"),
    allRequestHeadersOutput: document.getElementById("all-request-headers-output"),
    allResponseBodyOutput: document.getElementById("all-response-body-output"),
    allResponseHeadersOutput: document.getElementById("all-response-headers-output"),
    allTimingOutput: document.getElementById("all-timing-output"),
    captureStatus: document.getElementById("capture-status"),
    captureToggle: document.getElementById("capture-toggle"),
    clearButton: document.getElementById("clear-button"),
    detailContainer: document.querySelector(".request-formatter-detail"),
    detailDuration: document.getElementById("detail-duration"),
    detailMethod: document.getElementById("detail-method"),
    detailStatus: document.getElementById("detail-status"),
    detailType: document.getElementById("detail-type"),
    detailUrl: document.getElementById("detail-url"),
    detailView: document.getElementById("detail-view"),
    emptyState: document.getElementById("empty-state"),
    filter: document.getElementById("request-filter"),
    queryOutput: document.getElementById("query-output"),
    requestBodyOutput: document.getElementById("request-body-output"),
    requestHeadersOutput: document.getElementById("request-headers-output"),
    requestList: document.getElementById("request-list"),
    responseBodyOutput: document.getElementById("response-body-output"),
    responseHeadersOutput: document.getElementById("response-headers-output"),
    tabButtons: Array.from(document.querySelectorAll("[data-tab]")),
    tabPanels: Array.from(document.querySelectorAll("[data-panel]")),
    timingOutput: document.getElementById("timing-output"),
    ...window.RequestFormatterWebSocket.createDomRefs(document)
  };

  function getFallbackLocale() {
    const locale = window.chrome?.i18n?.getUILanguage?.() || navigator.language || "en";
    return locale.toLowerCase().startsWith("zh") ? "zh_CN" : "en";
  }

  function t(key, substitutions) {
    const values = Array.isArray(substitutions)
      ? substitutions.map(String)
      : substitutions === undefined
        ? []
        : [String(substitutions)];
    const message = window.chrome?.i18n?.getMessage?.(key, values);

    if (message) {
      return message;
    }

    const fallback = FALLBACK_MESSAGES[key]?.[getFallbackLocale()] || FALLBACK_MESSAGES[key]?.en || key;
    return values.reduce(function replaceSubstitution(result, value, index) {
      return result.replaceAll(`$${index + 1}`, value);
    }, fallback);
  }

  function applyStaticI18n() {
    document.documentElement.lang = getFallbackLocale() === "zh_CN" ? "zh-CN" : "en";

    document.querySelectorAll("[data-i18n]").forEach(function translateText(element) {
      element.textContent = t(element.dataset.i18n);
    });

    document.querySelectorAll("[data-i18n-attrs]").forEach(function translateAttributes(element) {
      element.dataset.i18nAttrs.split(",").forEach(function translateAttribute(pair) {
        const parts = pair.split(":");
        const attribute = parts[0]?.trim();
        const key = parts[1]?.trim();

        if (attribute && key) {
          element.setAttribute(attribute, t(key));
        }
      });
    });
  }

  const websocketController = window.RequestFormatterWebSocket.createController({
    state,
    dom,
    t,
    addEntry,
    getEntryById,
    getSelectedEntry,
    getActiveTab,
    refreshEntry,
    resetFormattedCache,
    formatPayload,
    formatTimestamp,
    escapeHtml,
    shortenUrl,
    setCaptureStatus,
    formatQuery,
    formatHeaders,
    formatDuration,
    updateDetailMeta
  });

  function createHttpEntry(request) {
    const har = request || {};
    const response = har.response || {};

    return {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
      kind: "http",
      method: har.request?.method || "GET",
      url: har.request?.url || "",
      status: response.status || 0,
      statusText: response.statusText || "",
      mimeType: response.content?.mimeType || "",
      startedDateTime: har.startedDateTime || "",
      duration: typeof har.time === "number" ? har.time : null,
      requestHeaders: har.request?.headers || [],
      requestPostData: har.request?.postData || null,
      responseHeaders: response.headers || [],
      responseContent: "",
      responseEncoding: "",
      responseLoadState: "loading",
      timings: har.timings || {},
      queryString: har.request?.queryString || [],
      formattedPreviewCache: {},
      formattedCopyCache: {}
    };
  }

  function getFormattedValue(entry, key, options) {
    const mode = options?.forCopy ? "formattedCopyCache" : "formattedPreviewCache";

    if (key !== "wsMessage" && entry[mode][key] !== undefined) {
      return entry[mode][key];
    }

    let value = "";

    if (entry.kind === "http") {
      switch (key) {
        case "query":
          value = formatQuery(entry.url, entry.queryString);
          break;
        case "requestHeaders":
          value = formatHeaders(entry.requestHeaders);
          break;
        case "requestBody":
          value = formatRequestBody(entry.requestPostData, options);
          break;
        case "responseHeaders":
          value = formatHeaders(entry.responseHeaders);
          break;
        case "responseBody":
          value = formatResponseBody(entry, options);
          break;
        case "timing":
          value = formatHttpTiming(entry);
          break;
        default:
          value = "";
          break;
      }
    } else {
      value = websocketController.getFormattedValue(entry, key, options);
    }

    if (key !== "wsMessage") {
      entry[mode][key] = value;
    }

    return value;
  }

  function resetFormattedCache(entry) {
    entry.formattedPreviewCache = {};
    entry.formattedCopyCache = {};
  }

  function formatQuery(url, queryString) {
    const pairs = [];

    if (Array.isArray(queryString) && queryString.length > 0) {
      queryString.forEach(function pushHarParam(param) {
        pairs.push([param.name, param.value]);
      });
    } else {
      try {
        const parsedUrl = new URL(url);
        parsedUrl.searchParams.forEach(function pushSearchParam(value, key) {
          pairs.push([key, value]);
        });
      } catch (error) {
        return "No URL params";
      }
    }

    if (pairs.length === 0) {
      return "No URL params";
    }

    return JSON.stringify(objectFromPairs(pairs), null, 2);
  }

  function formatHeaders(headers) {
    if (!Array.isArray(headers) || headers.length === 0) {
      return "No headers";
    }

    return JSON.stringify(
      objectFromPairs(headers.map(function toPair(header) {
        return [header.name, header.value];
      })),
      null,
      2
    );
  }

  function formatRequestBody(postData, options) {
    if (!postData) {
      return "No request body";
    }

    if (Array.isArray(postData.params) && postData.params.length > 0) {
      return JSON.stringify(
        objectFromPairs(postData.params.map(function toPair(param) {
          return [param.name, param.value];
        })),
        null,
        2
      );
    }

    if (!postData.text) {
      return "No request body";
    }

    return formatPayload(postData.text, postData.mimeType, options);
  }

  function formatResponseBody(entry, options) {
    if (entry.responseLoadState === "loading") {
      return "Loading response content...";
    }

    if (entry.responseLoadState === "unavailable") {
      return "Response content is unavailable. Keep DevTools open and preserve the Network log when needed.";
    }

    if (!entry.responseContent) {
      return "No response body";
    }

    if (entry.responseEncoding === "base64") {
      return [
        "[Base64 encoded response]",
        "Chrome returned this response as base64. Decode it externally if it is binary data.",
        "",
        entry.responseContent
      ].join("\n");
    }

    return formatPayload(entry.responseContent, entry.mimeType, options);
  }

  function formatPayload(text, mimeType, options) {
    const rawSource = String(text ?? "");
    const source = options?.preserveWhitespace ? rawSource : rawSource.trim();
    const detectionSource = source.trim();
    const type = String(mimeType || "").toLowerCase();
    const previewMode = !options?.forCopy;

    if (!source) {
      return "Empty body";
    }

    if (previewMode && source.length > LARGE_PAYLOAD_CHAR_LIMIT) {
      return [
        `[Preview only] Payload is too large to fully format in the panel (${source.length.toLocaleString()} chars).`,
        `Only the first ${PAYLOAD_PREVIEW_CHAR_LIMIT.toLocaleString()} chars are shown to keep the UI responsive.`,
        "",
        source.slice(0, PAYLOAD_PREVIEW_CHAR_LIMIT)
      ].join("\n");
    }

    if (looksLikeJson(type, detectionSource)) {
      const formattedJson = tryFormatJson(source);
      if (formattedJson) {
        return formattedJson;
      }
    }

    if (type.includes("application/x-www-form-urlencoded")) {
      return formatUrlEncoded(source);
    }

    return source;
  }

  function looksLikeJson(mimeType, source) {
    return mimeType.includes("json") || source.startsWith("{") || source.startsWith("[");
  }

  function tryFormatJson(source) {
    try {
      return JSON.stringify(JSON.parse(source), null, 2);
    } catch (error) {
      return "";
    }
  }

  function formatUrlEncoded(source) {
    const params = new URLSearchParams(source);
    const pairs = [];

    params.forEach(function pushParam(value, key) {
      pairs.push([key, value]);
    });

    if (pairs.length === 0) {
      return source;
    }

    return JSON.stringify(objectFromPairs(pairs), null, 2);
  }

  function objectFromPairs(pairs) {
    return pairs.reduce(function collect(result, pair) {
      const key = pair[0] || "";
      const value = pair[1] ?? "";

      if (!key) {
        return result;
      }

      if (Object.prototype.hasOwnProperty.call(result, key)) {
        result[key] = Array.isArray(result[key]) ? result[key].concat(value) : [result[key], value];
      } else {
        result[key] = value;
      }

      return result;
    }, {});
  }

  function formatHttpTiming(entry) {
    return JSON.stringify(
      {
        startedDateTime: entry.startedDateTime || "Unknown",
        durationMs: entry.duration,
        timings: entry.timings
      },
      null,
      2
    );
  }

  function addEntry(entry) {
    const previousSelectedId = state.selectedId;
    state.entries.unshift(entry);
    const removedEntries = trimEntries();

    if (!state.selectedId) {
      state.selectedId = entry.id;
    }

    removedEntries.forEach(function removeTrimmedEntry(removedEntry) {
      cleanupEntry(removedEntry);
      removeListItem(removedEntry.id);
    });

    if (!state.entries.some(function includesSelected(item) {
      return item.id === state.selectedId;
    })) {
      state.selectedId = entry.id;
    }

    insertListItem(entry);
    updateActiveListItem(state.selectedId, previousSelectedId);

    if (state.selectedId === entry.id) {
      renderDetail();
    }
  }

  function trimEntries() {
    const removedEntries = [];

    while (state.entries.length > MAX_ENTRIES) {
      const selectedIndex = state.entries.findIndex(function findSelectedIndex(item) {
        return item.id === state.selectedId;
      });
      const preserveSelected = selectedIndex >= MAX_ENTRIES;
      const removalIndex = preserveSelected ? MAX_ENTRIES - 1 : state.entries.length - 1;
      const removedEntry = state.entries.splice(removalIndex, 1)[0];

      if (removedEntry) {
        removedEntries.push(removedEntry);
      }
    }

    return removedEntries;
  }

  function cleanupEntry(entry) {
    if (entry.kind === "websocket") {
      websocketController.cleanupEntry(entry);
    }
  }

  function updateHttpEntryContent(id, content, encoding, isUnavailable) {
    const entry = getEntryById(id);

    if (!entry || entry.kind !== "http") {
      return;
    }

    entry.responseContent = content || "";
    entry.responseEncoding = encoding || "";
    entry.responseLoadState = isUnavailable ? "unavailable" : "loaded";
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function getEntryById(id) {
    return state.entries.find(function findById(item) {
      return item.id === id;
    });
  }

  function getSelectedEntry() {
    return getEntryById(state.selectedId);
  }

  function getFilteredEntries() {
    const keyword = state.filterText.trim().toLowerCase();

    if (!keyword) {
      return state.entries;
    }

    return state.entries.filter(function filterEntry(entry) {
      return matchesEntryFilter(entry, keyword);
    });
  }

  function render() {
    renderList();
    renderDetail();
  }

  function renderList() {
    rebuildList();
  }

  function renderDetail() {
    const selected = getSelectedEntry();

    if (!selected) {
      dom.emptyState.hidden = false;
      dom.detailView.hidden = true;
      return;
    }

    syncTabsForEntry(selected);
    dom.emptyState.hidden = true;
    dom.detailView.hidden = false;
    dom.detailMethod.textContent = selected.method;
    dom.detailUrl.textContent = selected.url;
    updateDetailMeta(selected);
    renderActiveTabContent(selected);
  }

  function updateDetailMeta(entry) {
    dom.detailStatus.textContent = formatEntryStatus(entry);
    dom.detailType.textContent = formatEntryType(entry);
    dom.detailDuration.textContent = formatEntryDuration(entry);
  }

  function syncTabsForEntry(entry) {
    const kind = entry.kind;
    const activeTab = getActiveTab(kind);

    dom.tabButtons.forEach(function toggleTab(button) {
      const isVisible = button.dataset.kind === kind;
      button.hidden = !isVisible;
      button.classList.toggle("is-active", isVisible && button.dataset.tab === activeTab);
    });

    dom.tabPanels.forEach(function togglePanel(panel) {
      const isVisible = panel.dataset.kind === kind;
      panel.hidden = !isVisible;
      panel.classList.toggle("is-active", isVisible && panel.dataset.panel === activeTab);
    });
  }

  function getActiveTab(kind) {
    const defaultTab = kind === "websocket" ? "overview" : "all";
    const activeTab = state.activeTabs[kind] || defaultTab;
    const availableTabs = dom.tabButtons
      .filter(function filterByKind(button) {
        return button.dataset.kind === kind;
      })
      .map(function collectTab(button) {
        return button.dataset.tab;
      });

    if (availableTabs.includes(activeTab)) {
      return activeTab;
    }

    state.activeTabs[kind] = defaultTab;
    return defaultTab;
  }

  function renderActiveTabContent(entry) {
    const activeTab = getActiveTab(entry.kind);

    if (entry.kind === "http") {
      if (activeTab === "all") {
        dom.allQueryOutput.textContent = getFormattedValue(entry, "query");
        dom.allRequestHeadersOutput.textContent = getFormattedValue(entry, "requestHeaders");
        dom.allRequestBodyOutput.textContent = getFormattedValue(entry, "requestBody");
        dom.allResponseHeadersOutput.textContent = getFormattedValue(entry, "responseHeaders");
        dom.allResponseBodyOutput.textContent = getFormattedValue(entry, "responseBody");
        dom.allTimingOutput.textContent = getFormattedValue(entry, "timing");
        return;
      }

      if (activeTab === "query") {
        dom.queryOutput.textContent = getFormattedValue(entry, "query");
        return;
      }

      if (activeTab === "request") {
        dom.requestHeadersOutput.textContent = getFormattedValue(entry, "requestHeaders");
        dom.requestBodyOutput.textContent = getFormattedValue(entry, "requestBody");
        return;
      }

      if (activeTab === "response") {
        dom.responseHeadersOutput.textContent = getFormattedValue(entry, "responseHeaders");
        dom.responseBodyOutput.textContent = getFormattedValue(entry, "responseBody");
        return;
      }

      if (activeTab === "timing") {
        dom.timingOutput.textContent = getFormattedValue(entry, "timing");
      }

      return;
    }
    websocketController.renderActiveTabContent(entry);
  }

  function formatEntryStatus(entry) {
    if (entry.kind === "websocket") {
      return websocketController.formatEntryStatus(entry);
    }

    if (!entry.status) {
      return "Pending";
    }

    return `${entry.status} ${entry.statusText || ""}`.trim();
  }

  function formatEntryType(entry) {
    if (entry.kind === "websocket") {
      return websocketController.formatEntryType(entry);
    }

    return entry.mimeType || "Unknown type";
  }

  function formatEntryDuration(entry) {
    if (entry.kind === "websocket") {
      return websocketController.formatEntryDuration(entry);
    }

    return formatDuration(entry.duration, "Unknown time");
  }

  function formatDuration(duration, fallback) {
    if (typeof duration !== "number" || Number.isNaN(duration)) {
      return fallback;
    }

    if (duration >= 1000) {
      return `${(duration / 1000).toFixed(1)} s`;
    }

    return `${duration.toFixed(0)} ms`;
  }

  function formatTimestamp(timestampMs) {
    if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
      return "";
    }

    return new Date(timestampMs).toISOString();
  }

  function shortenUrl(url) {
    try {
      const parsedUrl = new URL(url);
      return `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
    } catch (error) {
      return url || "Unknown URL";
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function matchesEntryFilter(entry, keyword) {
    if (entry.kind === "websocket") {
      return websocketController.matchesEntryFilter(entry, keyword);
    }

    return [
      entry.method,
      entry.url,
      String(entry.status),
      entry.statusText,
      entry.mimeType
    ].some(function includesKeyword(value) {
      return String(value || "").toLowerCase().includes(keyword);
    });
  }

  function shouldRenderEntry(entry) {
    const keyword = state.filterText.trim().toLowerCase();

    if (!keyword) {
      return true;
    }

    return matchesEntryFilter(entry, keyword);
  }

  function createListItem(entry) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "request-formatter-item";
    item.dataset.id = entry.id;

    if (entry.id === state.selectedId) {
      item.classList.add("is-active");
    }

    if (entry.kind === "websocket") {
      item.innerHTML = websocketController.createListItemContent(entry);

      return item;
    }

    item.innerHTML = [
      '<div class="request-formatter-item-main">',
      `<span class="request-formatter-item-method">${escapeHtml(entry.method)}</span>`,
      `<span class="request-formatter-item-url">${escapeHtml(shortenUrl(entry.url))}</span>`,
      "</div>",
      '<div class="request-formatter-item-sub">',
      `<span>${escapeHtml(formatEntryStatus(entry))}</span>`,
      `<span>${escapeHtml(formatEntryDuration(entry))}</span>`,
      "</div>"
    ].join("");

    return item;
  }

  function renderEmptyListState() {
    const empty = document.createElement("div");
    empty.className = "request-formatter-empty";
    empty.innerHTML = `<p>${escapeHtml(t("noMatchingRequests"))}</p>`;
    dom.requestList.replaceChildren(empty);
  }

  function rebuildList() {
    const entries = getFilteredEntries();
    const fragment = document.createDocumentFragment();

    state.listItemMap.clear();

    if (entries.length === 0) {
      renderEmptyListState();
      return;
    }

    entries.forEach(function appendEntry(entry) {
      const item = createListItem(entry);
      state.listItemMap.set(entry.id, item);
      fragment.append(item);
    });

    dom.requestList.replaceChildren(fragment);
  }

  function insertListItem(entry) {
    if (!shouldRenderEntry(entry)) {
      return;
    }

    const item = createListItem(entry);
    const emptyState = dom.requestList.querySelector(".request-formatter-empty");

    state.listItemMap.set(entry.id, item);

    if (emptyState) {
      dom.requestList.replaceChildren(item);
      return;
    }

    dom.requestList.prepend(item);
  }

  function refreshEntry(entry) {
    refreshListItem(entry);

    if (state.selectedId === entry.id) {
      if (entry.kind === "websocket" && websocketController.handleSelectedEntryRefresh(entry)) {
        return;
      }

      renderDetail();
    }
  }

  function refreshListItem(entry) {
    const existing = state.listItemMap.get(entry.id);

    if (!shouldRenderEntry(entry)) {
      if (existing) {
        existing.remove();
        state.listItemMap.delete(entry.id);
      }

      if (state.listItemMap.size === 0) {
        renderEmptyListState();
      }

      return;
    }

    const nextItem = createListItem(entry);

    if (!existing) {
      renderList();
      return;
    }

    existing.replaceWith(nextItem);
    state.listItemMap.set(entry.id, nextItem);
  }

  function removeListItem(id) {
    const item = state.listItemMap.get(id);

    if (!item) {
      return;
    }

    item.remove();
    state.listItemMap.delete(id);

    if (state.listItemMap.size === 0) {
      renderEmptyListState();
    }
  }

  function updateActiveListItem(nextId, previousId) {
    if (previousId && previousId !== nextId) {
      state.listItemMap.get(previousId)?.classList.remove("is-active");
    }

    if (nextId) {
      state.listItemMap.get(nextId)?.classList.add("is-active");
    }
  }

  function bindEvents() {
    dom.captureToggle.addEventListener("change", function updateCapture(event) {
      state.captureEnabled = event.target.checked;
    });

    dom.clearButton.addEventListener("click", function clearEntries() {
      websocketController.clearState();
      state.entries.forEach(cleanupEntry);
      state.entries = [];
      state.selectedId = null;
      render();
    });

    dom.filter.addEventListener("input", function filterEntries(event) {
      state.filterText = event.target.value;
      renderList();
    });

    dom.requestList.addEventListener("click", function selectEntry(event) {
      const item = event.target.closest("[data-id]");
      const previousSelectedId = state.selectedId;

      if (!item) {
        return;
      }

      state.selectedId = item.dataset.id;
      updateActiveListItem(state.selectedId, previousSelectedId);
      renderDetail();
      dom.detailContainer?.scrollTo({ top: 0, behavior: "auto" });
    });

    dom.tabButtons.forEach(function bindTab(tabButton) {
      tabButton.addEventListener("click", function activateTab() {
        if (tabButton.hidden) {
          return;
        }

        state.activeTabs[tabButton.dataset.kind] = tabButton.dataset.tab;
        renderDetail();
      });
    });

    document.querySelectorAll("[data-copy]").forEach(function bindCopy(copyButton) {
      copyButton.addEventListener("click", function copySection() {
        copyFormattedValue(copyButton);
      });
    });
    websocketController.bindUiEvents();
  }

  function copyFormattedValue(button) {
    const selected = getSelectedEntry();
    const key = button.dataset.copy;

    if (!selected || !key) {
      return;
    }

    copyText(getFormattedValue(selected, key, { forCopy: true }))
      .then(function showCopied() {
        const originalText = button.textContent;
        button.textContent = t("copiedButton");
        window.setTimeout(function restoreText() {
          button.textContent = originalText;
        }, 900);
      })
      .catch(function showCopyFailed() {
        const originalText = button.textContent;
        button.textContent = t("copyFailedButton");
        window.setTimeout(function restoreText() {
          button.textContent = originalText;
        }, 900);
      });
  }

  function copyText(text) {
    if (!navigator.clipboard?.writeText) {
      return Promise.reject(new Error("Clipboard API is unavailable."));
    }

    return navigator.clipboard.writeText(text);
  }

  function setCaptureStatus(message) {
    if (!message) {
      dom.captureStatus.hidden = true;
      dom.captureStatus.textContent = "";
      return;
    }

    dom.captureStatus.hidden = false;
    dom.captureStatus.textContent = message;
  }

  function startCapture() {
    if (!window.chrome?.devtools?.network?.onRequestFinished) {
      dom.emptyState.querySelector("p").textContent = t("devtoolsUnavailable");
      return;
    }

    websocketController.bindDebuggerEvents();

    if (!state.httpCaptureBound) {
      chrome.devtools.network.onRequestFinished.addListener(function onRequestFinished(request) {
        if (!state.captureEnabled || websocketController.isHandshakeRequest(request)) {
          return;
        }

        const entry = createHttpEntry(request);
        addEntry(entry);

        request.getContent(function handleContent(content, encoding) {
          const isUnavailable = Boolean(chrome.runtime?.lastError);
          updateHttpEntryContent(entry.id, content, encoding, isUnavailable);
        });
      });
      state.httpCaptureBound = true;
    }

    setCaptureStatus("");
  }

  applyStaticI18n();
  bindEvents();
  render();
  startCapture();
})();
