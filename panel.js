import {
  escapeHtml,
  formatDuration,
  formatHeaders,
  formatPayload,
  formatQuery,
  objectFromPairs,
  shortenUrl
} from "./formatters.js";
import {
  createCopyHintController,
  getHttpCopyFieldItems,
  renderCopyableFieldObject
} from "./copyable-detail.js";
import { createController as createDetailSearchController } from "./detail-search.js";
import { applyStaticI18n, t } from "./i18n.js";
import {
  createController as createWebSocketController,
  createDomRefs as createWebSocketDomRefs,
  createState as createWebSocketState
} from "./panel-websocket.js";

(function initRequestFormatterPanel() {
  const MAX_ENTRIES = 500;
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
    ...createWebSocketState({
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
    ...createWebSocketDomRefs(document)
  };

  const detailSearchController = createDetailSearchController({
    documentValue: document,
    windowValue: window,
    t,
    searchRoot: dom.detailView,
    onQueryChange: renderDetailBody
  });
  const detailRenderer = createDetailRenderer(detailSearchController);
  const copyHintController = createCopyHintController({
    container: dom.detailView,
    documentValue: document,
    windowValue: window,
    t,
    copyText
  });

  const websocketController = createWebSocketController({
    state,
    dom,
    t,
    addEntry,
    getEntryById,
    getSelectedEntry,
    getActiveTab,
    refreshEntry,
    resetFormattedCache,
    setCaptureStatus,
    updateDetailMeta,
    detailRenderer
  });

  function createDetailRenderer(searchController) {
    return {
      renderSection(renderContent) {
        searchController.beginRender();
        renderContent();
        searchController.finalizeRender();
      },
      renderText(node, value) {
        searchController.renderPre(node, value);
      },
      renderCopyableFields(node, items, formattedText) {
        if (items.length === 0) {
          searchController.renderPre(node, formattedText);
          return;
        }

        if (searchController.isActive()) {
          searchController.renderPre(node, formattedText);
          return;
        }

        renderCopyableFieldObject(node, items);
      }
    };
  }

  function createHttpEntry(request) {
    const har = request || {};
    const response = har.response || {};
    const loadResponseContent = typeof request?.getContent === "function"
      ? request.getContent.bind(request)
      : null;

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
      responseLoadState: loadResponseContent ? "idle" : "unavailable",
      responseContentLoader: loadResponseContent,
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
          value = formatQuery(entry.url, entry.queryString, options);
          break;
        case "requestHeaders":
          value = formatHeaders(entry.requestHeaders, options);
          break;
        case "requestBody":
          value = formatRequestBody(entry.requestPostData, options);
          break;
        case "responseHeaders":
          value = formatHeaders(entry.responseHeaders, options);
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

  function formatRequestBody(postData, options) {
    if (!postData) {
      return options?.forCopy ? "" : "No request body";
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
      return options?.forCopy ? "" : "No request body";
    }

    return formatPayload(postData.text, postData.mimeType, { ...options, t });
  }

  function formatResponseBody(entry, options) {
    if (entry.responseLoadState === "idle") {
      return options?.forCopy ? "" : t("responseContentNotLoaded");
    }

    if (entry.responseLoadState === "loading") {
      return options?.forCopy ? "" : "Loading response content...";
    }

    if (entry.responseLoadState === "unavailable") {
      return options?.forCopy ? "" : t("responseContentUnavailable");
    }

    if (!entry.responseContent) {
      return options?.forCopy ? "" : "No response body";
    }

    if (entry.responseEncoding === "base64") {
      if (options?.forCopy) {
        return entry.responseContent;
      }

      return [
        t("responseBase64Title"),
        t("responseBase64Description"),
        "",
        entry.responseContent
      ].join("\n");
    }

    return formatPayload(entry.responseContent, entry.mimeType, { ...options, t });
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
      return;
    }

    entry.responseContentLoader = null;
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

  function ensureResponseContentLoaded(entry) {
    if (
      !entry ||
      entry.kind !== "http" ||
      entry.responseLoadState !== "idle" ||
      typeof entry.responseContentLoader !== "function"
    ) {
      return;
    }

    entry.responseLoadState = "loading";
    resetFormattedCache(entry);

    entry.responseContentLoader(function handleContent(content, encoding) {
      const isUnavailable = Boolean(chrome.runtime?.lastError);
      updateHttpEntryContent(entry.id, content, encoding, isUnavailable);
    });
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

  function renderDetail(options) {
    const selected = getSelectedEntry();

    if (!selected) {
      dom.emptyState.hidden = false;
      dom.detailView.hidden = true;
      detailSearchController.resetMatches();
      return;
    }

    const shouldRenderShell = options?.shell !== false;
    const shouldRenderBody = options?.body !== false;

    if (shouldRenderShell) {
      renderDetailShell(selected);
    }

    if (shouldRenderBody) {
      renderDetailBody(selected);
    }
  }

  function renderDetailShell(entry) {
    syncTabsForEntry(entry);
    dom.emptyState.hidden = true;
    dom.detailView.hidden = false;
    dom.detailMethod.textContent = entry.method;
    dom.detailUrl.textContent = entry.url;
    updateDetailMeta(entry);
  }

  function renderDetailBody(entry) {
    const selected = entry || getSelectedEntry();

    if (!selected) {
      detailSearchController.resetMatches();
      return;
    }

    renderActiveTabContent(selected);
  }

  function updateDetailMeta(entry) {
    dom.detailStatus.textContent = formatEntryStatus(entry);
    dom.detailStatus.classList.toggle("is-error", hasErrorStatus(entry));
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
        ensureResponseContentLoaded(entry);
        detailRenderer.renderSection(function renderAllTab() {
          detailRenderer.renderCopyableFields(
            dom.allQueryOutput,
            getHttpCopyFieldItems(entry, "query"),
            getFormattedValue(entry, "query")
          );
          detailRenderer.renderCopyableFields(
            dom.allRequestHeadersOutput,
            getHttpCopyFieldItems(entry, "requestHeaders"),
            getFormattedValue(entry, "requestHeaders")
          );
          detailRenderer.renderText(dom.allRequestBodyOutput, getFormattedValue(entry, "requestBody"));
          detailRenderer.renderCopyableFields(
            dom.allResponseHeadersOutput,
            getHttpCopyFieldItems(entry, "responseHeaders"),
            getFormattedValue(entry, "responseHeaders")
          );
          detailRenderer.renderText(dom.allResponseBodyOutput, getFormattedValue(entry, "responseBody"));
          detailRenderer.renderText(dom.allTimingOutput, getFormattedValue(entry, "timing"));
        });
        return;
      }

      if (activeTab === "query") {
        detailRenderer.renderSection(function renderQueryTab() {
          detailRenderer.renderCopyableFields(
            dom.queryOutput,
            getHttpCopyFieldItems(entry, "query"),
            getFormattedValue(entry, "query")
          );
        });
        return;
      }

      if (activeTab === "request") {
        detailRenderer.renderSection(function renderRequestTab() {
          detailRenderer.renderCopyableFields(
            dom.requestHeadersOutput,
            getHttpCopyFieldItems(entry, "requestHeaders"),
            getFormattedValue(entry, "requestHeaders")
          );
          detailRenderer.renderText(dom.requestBodyOutput, getFormattedValue(entry, "requestBody"));
        });
        return;
      }

      if (activeTab === "response") {
        ensureResponseContentLoaded(entry);
        detailRenderer.renderSection(function renderResponseTab() {
          detailRenderer.renderCopyableFields(
            dom.responseHeadersOutput,
            getHttpCopyFieldItems(entry, "responseHeaders"),
            getFormattedValue(entry, "responseHeaders")
          );
          detailRenderer.renderText(dom.responseBodyOutput, getFormattedValue(entry, "responseBody"));
        });
        return;
      }

      if (activeTab === "timing") {
        detailRenderer.renderSection(function renderTimingTab() {
          detailRenderer.renderText(dom.timingOutput, getFormattedValue(entry, "timing"));
        });
        return;
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

  function hasErrorStatus(entry) {
    return entry.kind !== "websocket" && Number(entry.status) >= 400;
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

    if (hasErrorStatus(entry)) {
      item.classList.add("has-error-status");
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
      `<span class="request-formatter-item-status">${escapeHtml(formatEntryStatus(entry))}</span>`,
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
      copyHintController.hide();
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

    detailSearchController.bindEvents();

    dom.requestList.addEventListener("click", function selectEntry(event) {
      const item = event.target.closest("[data-id]");
      const previousSelectedId = state.selectedId;

      if (!item) {
        return;
      }

      state.selectedId = item.dataset.id;
      updateActiveListItem(state.selectedId, previousSelectedId);
      copyHintController.hide();
      renderDetail();
      dom.detailContainer?.scrollTo({ top: 0, behavior: "auto" });
    });

    dom.tabButtons.forEach(function bindTab(tabButton) {
      tabButton.addEventListener("click", function activateTab() {
        if (tabButton.hidden) {
          return;
        }

        state.activeTabs[tabButton.dataset.kind] = tabButton.dataset.tab;
        copyHintController.hide();
        renderDetail();
      });
    });

    document.querySelectorAll("[data-copy]").forEach(function bindCopy(copyButton) {
      copyButton.addEventListener("click", function copySection() {
        copyFormattedValue(copyButton);
      });
    });
    copyHintController.bindEvents();
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
        showCopyButtonState(button, t("copiedButton"));
      })
      .catch(function showCopyFailed() {
        showCopyButtonState(button, t("copyFailedButton"));
      });
  }

  function showCopyButtonState(button, message) {
    const originalText = button.textContent;

    button.textContent = message;
    window.setTimeout(function restoreText() {
      button.textContent = originalText;
    }, 900);
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
