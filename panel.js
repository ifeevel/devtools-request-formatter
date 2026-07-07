(function initRequestFormatterPanel() {
  const MAX_ENTRIES = 500;
  const LARGE_PAYLOAD_CHAR_LIMIT = 100000;
  const PAYLOAD_PREVIEW_CHAR_LIMIT = 20000;
  const state = {
    entries: [],
    selectedId: null,
    filterText: "",
    captureEnabled: true,
    activeTab: "all",
    listItemMap: new Map()
  };

  const dom = {
    allQueryOutput: document.getElementById("all-query-output"),
    allRequestBodyOutput: document.getElementById("all-request-body-output"),
    allRequestHeadersOutput: document.getElementById("all-request-headers-output"),
    allResponseBodyOutput: document.getElementById("all-response-body-output"),
    allResponseHeadersOutput: document.getElementById("all-response-headers-output"),
    allTimingOutput: document.getElementById("all-timing-output"),
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
    timingOutput: document.getElementById("timing-output")
  };

  function createEntry(request) {
    const har = request || {};
    const response = har.response || {};
    const entry = {
      id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

    return entry;
  }

  function getFormattedValue(entry, key, options) {
    const mode = options?.forCopy ? "formattedCopyCache" : "formattedPreviewCache";

    if (entry[mode][key] !== undefined) {
      return entry[mode][key];
    }

    let value = "";

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
        value = formatTiming(entry);
        break;
      default:
        value = "";
        break;
    }

    entry[mode][key] = value;
    return value;
  }

  function clearFormattedCache(entry, keys) {
    keys.forEach(function clearKey(key) {
      delete entry.formattedPreviewCache[key];
      delete entry.formattedCopyCache[key];
    });
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

    return JSON.stringify(objectFromPairs(headers.map(function toPair(header) {
      return [header.name, header.value];
    })), null, 2);
  }

  function formatRequestBody(postData, options) {
    if (!postData) {
      return "No request body";
    }

    if (Array.isArray(postData.params) && postData.params.length > 0) {
      return JSON.stringify(objectFromPairs(postData.params.map(function toPair(param) {
        return [param.name, param.value];
      })), null, 2);
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
    const source = String(text || "").trim();
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

    if (looksLikeJson(type, source)) {
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
    return (
      mimeType.includes("json") ||
      source.startsWith("{") ||
      source.startsWith("[")
    );
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
        result[key] = Array.isArray(result[key])
          ? result[key].concat(value)
          : [result[key], value];
      } else {
        result[key] = value;
      }

      return result;
    }, {});
  }

  function formatTiming(entry) {
    const data = {
      startedDateTime: entry.startedDateTime || "Unknown",
      durationMs: entry.duration,
      timings: entry.timings
    };

    return JSON.stringify(data, null, 2);
  }

  function addEntry(entry) {
    const previousSelectedId = state.selectedId;
    state.entries.unshift(entry);
    const removedEntries = trimEntries();

    if (!state.selectedId) {
      state.selectedId = entry.id;
    }

    removedEntries.forEach(function removeTrimmedEntry(removedEntry) {
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

  function updateEntryContent(id, content, encoding, isUnavailable) {
    const entry = state.entries.find(function findById(item) {
      return item.id === id;
    });

    if (!entry) {
      return;
    }

    entry.responseContent = content || "";
    entry.responseEncoding = encoding || "";
    entry.responseLoadState = isUnavailable ? "unavailable" : "loaded";
    clearFormattedCache(entry, ["responseBody"]);

    if (state.selectedId === entry.id) {
      renderDetail();
    }
  }

  function getSelectedEntry() {
    return state.entries.find(function findSelected(entry) {
      return entry.id === state.selectedId;
    });
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

    dom.emptyState.hidden = true;
    dom.detailView.hidden = false;
    dom.detailMethod.textContent = selected.method;
    dom.detailUrl.textContent = selected.url;
    dom.detailStatus.textContent = formatStatus(selected);
    dom.detailType.textContent = selected.mimeType || "Unknown type";
    dom.detailDuration.textContent = formatDuration(selected.duration);
    renderActiveTabContent(selected);
  }

  function renderActiveTabContent(selected) {
    const tab = state.activeTab;

    if (tab === "all") {
      dom.allQueryOutput.textContent = getFormattedValue(selected, "query");
      dom.allRequestHeadersOutput.textContent = getFormattedValue(selected, "requestHeaders");
      dom.allRequestBodyOutput.textContent = getFormattedValue(selected, "requestBody");
      dom.allResponseHeadersOutput.textContent = getFormattedValue(selected, "responseHeaders");
      dom.allResponseBodyOutput.textContent = getFormattedValue(selected, "responseBody");
      dom.allTimingOutput.textContent = getFormattedValue(selected, "timing");
      return;
    }

    if (tab === "query") {
      dom.queryOutput.textContent = getFormattedValue(selected, "query");
      return;
    }

    if (tab === "request") {
      dom.requestHeadersOutput.textContent = getFormattedValue(selected, "requestHeaders");
      dom.requestBodyOutput.textContent = getFormattedValue(selected, "requestBody");
      return;
    }

    if (tab === "response") {
      dom.responseHeadersOutput.textContent = getFormattedValue(selected, "responseHeaders");
      dom.responseBodyOutput.textContent = getFormattedValue(selected, "responseBody");
      return;
    }

    if (tab === "timing") {
      dom.timingOutput.textContent = getFormattedValue(selected, "timing");
    }
  }

  function formatStatus(entry) {
    if (!entry.status) {
      return "Pending";
    }

    return `${entry.status} ${entry.statusText || ""}`.trim();
  }

  function formatDuration(duration) {
    if (typeof duration !== "number" || Number.isNaN(duration)) {
      return "Unknown time";
    }

    return `${duration.toFixed(0)} ms`;
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

    item.innerHTML = [
      '<div class="request-formatter-item-main">',
      `<span class="request-formatter-item-method">${escapeHtml(entry.method)}</span>`,
      `<span class="request-formatter-item-url">${escapeHtml(shortenUrl(entry.url))}</span>`,
      "</div>",
      '<div class="request-formatter-item-sub">',
      `<span>${escapeHtml(formatStatus(entry))}</span>`,
      `<span>${escapeHtml(formatDuration(entry.duration))}</span>`,
      "</div>"
    ].join("");

    return item;
  }

  function renderEmptyListState() {
    const empty = document.createElement("div");
    empty.className = "request-formatter-empty";
    empty.innerHTML = "<p>暂无匹配请求</p>";
    dom.requestList.replaceChildren(empty);
  }

  function rebuildList() {
    const entries = getFilteredEntries();
    state.listItemMap.clear();

    if (entries.length === 0) {
      renderEmptyListState();
      return;
    }

    const fragment = document.createDocumentFragment();

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

    document.querySelectorAll("[data-tab]").forEach(function bindTab(tabButton) {
      tabButton.addEventListener("click", function activateTab() {
        const tab = tabButton.dataset.tab;
        const selected = getSelectedEntry();

        state.activeTab = tab;

        document.querySelectorAll("[data-tab]").forEach(function resetTab(button) {
          button.classList.toggle("is-active", button === tabButton);
        });

        document.querySelectorAll("[data-panel]").forEach(function resetPanel(panel) {
          panel.classList.toggle("is-active", panel.dataset.panel === tab);
        });

        if (selected) {
          renderActiveTabContent(selected);
        }
      });
    });

    document.querySelectorAll("[data-copy]").forEach(function bindCopy(copyButton) {
      copyButton.addEventListener("click", function copySection() {
        copyFormattedValue(copyButton);
      });
    });
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
        button.textContent = "已复制";
        window.setTimeout(function restoreText() {
          button.textContent = originalText;
        }, 900);
      })
      .catch(function showCopyFailed() {
        const originalText = button.textContent;
        button.textContent = "复制失败";
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

  function startCapture() {
    if (!window.chrome?.devtools?.network?.onRequestFinished) {
      dom.emptyState.querySelector("p").textContent =
        "当前页面不在 Chrome DevTools Extension 环境中，请以未打包扩展加载后打开 DevTools 使用。";
      return;
    }

    chrome.devtools.network.onRequestFinished.addListener(function onRequestFinished(request) {
      if (!state.captureEnabled) {
        return;
      }

      const entry = createEntry(request);
      addEntry(entry);

      request.getContent(function handleContent(content, encoding) {
        const isUnavailable = Boolean(chrome.runtime?.lastError);
        updateEntryContent(entry.id, content, encoding, isUnavailable);
      });
    });
  }

  bindEvents();
  render();
  startCapture();
})();
