(function initRequestFormatterPanel() {
  const MAX_ENTRIES = 500;
  const MAX_WEBSOCKET_FRAMES = 500;
  const LARGE_PAYLOAD_CHAR_LIMIT = 100000;
  const PAYLOAD_PREVIEW_CHAR_LIMIT = 20000;
  const DEBUGGER_PROTOCOL_VERSION = "1.3";
  const WEBSOCKET_MIME_TYPE = "WebSocket";
  const WEBSOCKET_DEFAULT_PROTOCOL_LABEL = "WebSocket";
  const state = {
    entries: [],
    selectedId: null,
    filterText: "",
    captureEnabled: true,
      webSocketCaptureEnabled: false,
    activeTabs: {
      http: "all",
      websocket: "overview"
    },
    listItemMap: new Map(),
    webSocketEntryIdsByRequestId: new Map(),
    inspectedTabId: window.chrome?.devtools?.inspectedWindow?.tabId ?? null,
    httpCaptureBound: false,
    debuggerEventsBound: false,
    debuggerAttached: false,
    debuggerPending: false
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
      websocketToggle: document.getElementById("websocket-toggle"),
    wsMessageFilter: document.getElementById("ws-message-filter"),
    wsMessageList: document.getElementById("ws-message-list"),
    wsMessageMeta: document.getElementById("ws-message-meta"),
    wsMessageOutput: document.getElementById("ws-message-output"),
    wsMessageSummary: document.getElementById("ws-message-summary"),
    wsOverviewOutput: document.getElementById("ws-overview-output"),
    wsQueryOutput: document.getElementById("ws-query-output"),
    wsRequestHeadersOutput: document.getElementById("ws-request-headers-output"),
    wsResponseHeadersOutput: document.getElementById("ws-response-headers-output"),
    wsTimingOutput: document.getElementById("ws-timing-output")
  };

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

  function createWebSocketEntry(requestId, url) {
    const nowIso = new Date().toISOString();

    return {
      id: `ws-${requestId}-${Math.random().toString(16).slice(2)}`,
      kind: "websocket",
      method: "WS",
      url: url || "",
      status: 0,
      statusText: "",
      mimeType: WEBSOCKET_MIME_TYPE,
      startedDateTime: nowIso,
      duration: null,
      requestHeaders: [],
      requestPostData: null,
      responseHeaders: [],
      responseContent: "",
      responseEncoding: "",
      responseLoadState: "loaded",
      timings: {},
      queryString: parseQueryString(url),
      formattedPreviewCache: {},
      formattedCopyCache: {},
      websocket: {
        requestId,
        state: "connecting",
        protocol: "",
        extensions: "",
        sentCount: 0,
        receivedCount: 0,
        frameFilterText: "",
        frames: [],
        selectedFrameId: null,
        errorText: "",
        createdAtMs: null,
        connectedAtMs: null,
        closedAtMs: null,
        lastEventAtMs: null,
        timeOriginTimestamp: null,
        timeOriginWallTimeMs: null
      }
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
      switch (key) {
        case "query":
          value = formatQuery(entry.url, entry.queryString);
          break;
        case "requestHeaders":
          value = formatHeaders(entry.requestHeaders);
          break;
        case "responseHeaders":
          value = formatHeaders(entry.responseHeaders);
          break;
        case "timing":
          value = formatWebSocketTiming(entry);
          break;
        case "wsOverview":
          value = formatWebSocketOverview(entry);
          break;
        case "wsMessage":
          value = formatSelectedWebSocketMessage(entry, options);
          break;
        default:
          value = "";
          break;
      }
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

  function formatWebSocketTiming(entry) {
    const socket = entry.websocket;

    return JSON.stringify(
      {
        startedDateTime: entry.startedDateTime || "Unknown",
        state: socket.state,
        createdAt: formatTimestamp(socket.createdAtMs),
        connectedAt: formatTimestamp(socket.connectedAtMs),
        closedAt: formatTimestamp(socket.closedAtMs),
        lastEventAt: formatTimestamp(socket.lastEventAtMs),
        durationMs: getWebSocketDuration(entry),
        framesKept: socket.frames.length,
        framesLimit: MAX_WEBSOCKET_FRAMES
      },
      null,
      2
    );
  }

  function formatWebSocketOverview(entry) {
    const socket = entry.websocket;

    return JSON.stringify(
      {
        url: entry.url,
        state: socket.state,
        handshakeStatus: formatEntryStatus(entry),
        protocol: socket.protocol || "Not negotiated",
        extensions: socket.extensions || "None",
        sentMessages: socket.sentCount,
        receivedMessages: socket.receivedCount,
        framesKept: socket.frames.length,
        error: socket.errorText || "",
        connectedAt: formatTimestamp(socket.connectedAtMs),
        closedAt: formatTimestamp(socket.closedAtMs),
        durationMs: getWebSocketDuration(entry)
      },
      null,
      2
    );
  }

  function formatSelectedWebSocketMessage(entry, options) {
    const frame = getSelectedWebSocketFrame(entry);

    if (!frame) {
      return "No message selected";
    }

    const payload = formatWebSocketFramePayload(frame, options);

    return [
      `Direction: ${frame.direction === "sent" ? "Sent" : "Received"}`,
      `Type: ${frame.type}`,
      `Opcode: ${frame.opcode}`,
      `Size: ${frame.size.toLocaleString()} bytes`,
      `Time: ${formatTimestamp(frame.timeMs) || "Unknown"}`,
      "",
      payload
    ].join("\n");
  }

  function formatWebSocketFramePayload(frame, options) {
    if (frame.type === "binary") {
      return `Binary frame (${frame.size.toLocaleString()} bytes). Raw payload decoding is not supported in v1.`;
    }

    if (frame.type === "ping" || frame.type === "pong" || frame.type === "close") {
      return frame.payloadData || "No payload";
    }

    return formatPayload(frame.payloadData, frame.type === "json" ? "application/json" : "text/plain", options);
  }

  function parseQueryString(url) {
    try {
      const parsedUrl = new URL(url);
      const pairs = [];
      parsedUrl.searchParams.forEach(function pushSearchParam(value, key) {
        pairs.push({ name: key, value });
      });
      return pairs;
    } catch (error) {
      return [];
    }
  }

  function normalizeHeaderValue(value) {
    if (Array.isArray(value)) {
      return value.join(", ");
    }

    if (value === null || value === undefined) {
      return "";
    }

    return String(value);
  }

  function headerPairsFromObject(headers) {
    if (!headers || typeof headers !== "object") {
      return [];
    }

    return Object.keys(headers).map(function toHeaderPair(name) {
      return {
        name,
        value: normalizeHeaderValue(headers[name])
      };
    });
  }

  function getHeaderValue(headers, headerName) {
    const target = String(headerName || "").toLowerCase();
    const found = (headers || []).find(function findHeader(header) {
      return String(header.name || "").toLowerCase() === target;
    });

    return found?.value || "";
  }

  function createWebSocketFrame(entry, direction, response, timestamp) {
    const payloadData = String(response?.payloadData || "");
    const opcode = typeof response?.opcode === "number" ? response.opcode : -1;
    const type = getWebSocketFrameType(payloadData, opcode);
    const size = getTextByteLength(payloadData);
    const timeMs = resolveEventTimeMs(entry, timestamp, null) || Date.now();

    return {
      id: `${entry.websocket.requestId}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      direction,
      opcode,
      type,
      payloadData,
      size,
      timeMs
    };
  }

  function getWebSocketFrameType(payloadData, opcode) {
    if (opcode === 2) {
      return "binary";
    }

    if (opcode === 8) {
      return "close";
    }

    if (opcode === 9) {
      return "ping";
    }

    if (opcode === 10) {
      return "pong";
    }

    if (looksLikeJson("", String(payloadData || "").trim())) {
      return "json";
    }

    return "text";
  }

  function getTextByteLength(value) {
    try {
      return new TextEncoder().encode(String(value || "")).length;
    } catch (error) {
      return String(value || "").length;
    }
  }

  function ensureWebSocketEntry(requestId, url) {
    const existingId = state.webSocketEntryIdsByRequestId.get(requestId);

    if (existingId) {
      return getEntryById(existingId);
    }

    const entry = createWebSocketEntry(requestId, url);
    state.webSocketEntryIdsByRequestId.set(requestId, entry.id);
    addEntry(entry);
    return entry;
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
      state.webSocketEntryIdsByRequestId.delete(entry.websocket.requestId);
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
    dom.detailStatus.textContent = formatEntryStatus(selected);
    dom.detailType.textContent = formatEntryType(selected);
    dom.detailDuration.textContent = formatEntryDuration(selected);
    renderActiveTabContent(selected);
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

    if (activeTab === "overview") {
      dom.wsOverviewOutput.textContent = getFormattedValue(entry, "wsOverview");
      return;
    }

    if (activeTab === "handshake") {
      dom.wsQueryOutput.textContent = getFormattedValue(entry, "query");
      dom.wsRequestHeadersOutput.textContent = getFormattedValue(entry, "requestHeaders");
      dom.wsResponseHeadersOutput.textContent = getFormattedValue(entry, "responseHeaders");
      return;
    }

    if (activeTab === "messages") {
      renderWebSocketMessages(entry);
      return;
    }

    if (activeTab === "timing") {
      dom.wsTimingOutput.textContent = getFormattedValue(entry, "timing");
    }
  }

  function renderWebSocketMessages(entry) {
    const frames = getFilteredWebSocketFrames(entry);
    const selectedFrame = ensureSelectedWebSocketFrame(entry, frames);
    const fragment = document.createDocumentFragment();

    dom.wsMessageFilter.value = entry.websocket.frameFilterText;
    dom.wsMessageSummary.textContent = frames.length === entry.websocket.frames.length
      ? `共 ${frames.length} 条消息，最多保留最近 ${MAX_WEBSOCKET_FRAMES} 条。`
      : `过滤后 ${frames.length} 条，原始共 ${entry.websocket.frames.length} 条。`;

    if (frames.length === 0) {
      const empty = document.createElement("div");
      empty.className = "request-formatter-inline-empty";
      empty.textContent = "暂无匹配消息";
      dom.wsMessageList.replaceChildren(empty);
    } else {
      frames.forEach(function appendFrame(frame) {
        fragment.append(createWebSocketFrameItem(frame, entry.websocket.selectedFrameId));
      });
      dom.wsMessageList.replaceChildren(fragment);
    }

    if (!selectedFrame) {
      dom.wsMessageMeta.textContent = "未选中消息";
      dom.wsMessageOutput.textContent = "No message selected";
      return;
    }

    dom.wsMessageMeta.textContent = [
      selectedFrame.direction === "sent" ? "Sent" : "Received",
      selectedFrame.type,
      `${selectedFrame.size.toLocaleString()} bytes`,
      formatTimestamp(selectedFrame.timeMs) || "Unknown time"
    ].join(" · ");
    dom.wsMessageOutput.textContent = formatSelectedWebSocketMessage(entry);
  }

  function getFilteredWebSocketFrames(entry) {
    const keyword = entry.websocket.frameFilterText.trim().toLowerCase();

    if (!keyword) {
      return entry.websocket.frames;
    }

    return entry.websocket.frames.filter(function filterFrame(frame) {
      return [
        frame.direction,
        frame.type,
        frame.payloadData
      ].some(function includesKeyword(value) {
        return String(value || "").toLowerCase().includes(keyword);
      });
    });
  }

  function ensureSelectedWebSocketFrame(entry, filteredFrames) {
    const frames = Array.isArray(filteredFrames) ? filteredFrames : entry.websocket.frames;

    if (frames.length === 0) {
      entry.websocket.selectedFrameId = null;
      return null;
    }

    const selected = frames.find(function findSelected(frame) {
      return frame.id === entry.websocket.selectedFrameId;
    });

    if (selected) {
      return selected;
    }

    entry.websocket.selectedFrameId = frames[0].id;
    return frames[0];
  }

  function getSelectedWebSocketFrame(entry) {
    if (entry.kind !== "websocket") {
      return null;
    }

    return entry.websocket.frames.find(function findSelectedFrame(frame) {
      return frame.id === entry.websocket.selectedFrameId;
    }) || null;
  }

  function createWebSocketFrameItem(frame, selectedFrameId) {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "request-formatter-message-item";
    item.dataset.frameId = frame.id;

    if (frame.id === selectedFrameId) {
      item.classList.add("is-active");
    }

    item.innerHTML = [
      '<div class="request-formatter-message-head">',
      `<span class="request-formatter-message-direction ${frame.direction === "sent" ? "is-sent" : "is-received"}">${escapeHtml(frame.direction === "sent" ? "↑ Sent" : "↓ Received")}</span>`,
      `<span class="request-formatter-message-size">${escapeHtml(`${frame.type} · ${frame.size.toLocaleString()} bytes`)}</span>`,
      "</div>",
      `<p class="request-formatter-message-preview">${escapeHtml(getWebSocketFramePreview(frame))}</p>`
    ].join("");

    return item;
  }

  function getWebSocketFramePreview(frame) {
    if (frame.type === "binary") {
      return `Binary frame (${frame.size.toLocaleString()} bytes)`;
    }

    if (frame.type === "ping" || frame.type === "pong" || frame.type === "close") {
      return frame.payloadData || `${frame.type} frame`;
    }

    const singleLine = String(frame.payloadData || "").replace(/\s+/g, " ").trim();
    return singleLine || "Empty payload";
  }

  function formatEntryStatus(entry) {
    if (entry.kind === "websocket") {
      const socket = entry.websocket;

      if (entry.status) {
        return `${entry.status} ${entry.statusText || ""}`.trim();
      }

      if (socket.state === "failed") {
        return "Handshake failed";
      }

      if (socket.state === "closed") {
        return "Closed";
      }

      if (socket.state === "open") {
        return "Open";
      }

      return "Connecting";
    }

    if (!entry.status) {
      return "Pending";
    }

    return `${entry.status} ${entry.statusText || ""}`.trim();
  }

  function formatEntryType(entry) {
    if (entry.kind === "websocket") {
      return entry.websocket.protocol || WEBSOCKET_DEFAULT_PROTOCOL_LABEL;
    }

    return entry.mimeType || "Unknown type";
  }

  function formatEntryDuration(entry) {
    if (entry.kind === "websocket") {
      const duration = getWebSocketDuration(entry);
      return formatDuration(duration, "Connection time");
    }

    return formatDuration(entry.duration, "Unknown time");
  }

  function getWebSocketDuration(entry) {
    const socket = entry.websocket;
    const startMs = socket.connectedAtMs || socket.createdAtMs;
    const endMs = socket.closedAtMs || socket.lastEventAtMs || null;

    if (!startMs) {
      return null;
    }

    if (endMs) {
      return Math.max(0, endMs - startMs);
    }

    return Math.max(0, Date.now() - startMs);
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
      return [
        entry.method,
        entry.url,
        String(entry.status),
        entry.statusText,
        entry.websocket.state,
        entry.websocket.protocol,
        entry.websocket.errorText
      ].some(function includesKeyword(value) {
        return String(value || "").toLowerCase().includes(keyword);
      });
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
      item.innerHTML = [
        '<div class="request-formatter-item-main">',
        '<span class="request-formatter-item-method is-websocket">WS</span>',
        `<span class="request-formatter-item-url">${escapeHtml(shortenUrl(entry.url))}</span>`,
        "</div>",
        '<div class="request-formatter-item-sub">',
        `<span>${escapeHtml(formatWebSocketListStatus(entry))}</span>`,
        `<span>${escapeHtml(formatWebSocketListSummary(entry))}</span>`,
        "</div>"
      ].join("");

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

  function formatWebSocketListStatus(entry) {
    if (entry.status) {
      return formatEntryStatus(entry);
    }

    return entry.websocket.state === "open"
      ? "Open"
      : entry.websocket.state === "closed"
        ? "Closed"
        : entry.websocket.state === "failed"
          ? "Failed"
          : "Connecting";
  }

  function formatWebSocketListSummary(entry) {
    return `↑ ${entry.websocket.sentCount} / ↓ ${entry.websocket.receivedCount}`;
  }

  function renderEmptyListState() {
    const empty = document.createElement("div");
    empty.className = "request-formatter-empty";
    empty.innerHTML = "<p>暂无匹配请求</p>";
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

      dom.websocketToggle.addEventListener("change", function updateWebSocketCapture(event) {
        updateWebSocketCaptureState(event.target.checked).catch(function ignoreError() {});
    });

    dom.clearButton.addEventListener("click", function clearEntries() {
      state.entries.forEach(cleanupEntry);
      state.entries = [];
      state.selectedId = null;
      state.webSocketEntryIdsByRequestId.clear();
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

    dom.wsMessageFilter.addEventListener("input", function filterFrames(event) {
      const selected = getSelectedEntry();

      if (!selected || selected.kind !== "websocket") {
        return;
      }

      selected.websocket.frameFilterText = event.target.value;
      renderWebSocketMessages(selected);
    });

    dom.wsMessageList.addEventListener("click", function selectFrame(event) {
      const selected = getSelectedEntry();
      const item = event.target.closest("[data-frame-id]");

      if (!selected || selected.kind !== "websocket" || !item) {
        return;
      }

      selected.websocket.selectedFrameId = item.dataset.frameId;
      renderWebSocketMessages(selected);
    });

    window.addEventListener("beforeunload", function cleanupCapture() {
      detachWebSocketDebugger({ silent: true }).catch(function ignoreError() {});
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
      dom.emptyState.querySelector("p").textContent =
        "当前页面不在 Chrome DevTools Extension 环境中，请以未打包扩展加载后打开 DevTools 使用。";
      return;
    }

    bindDebuggerEvents();

    if (!state.httpCaptureBound) {
      chrome.devtools.network.onRequestFinished.addListener(function onRequestFinished(request) {
        if (!state.captureEnabled || isWebSocketHandshakeRequest(request)) {
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

  function bindDebuggerEvents() {
    if (state.debuggerEventsBound || !window.chrome?.debugger?.onEvent) {
      return;
    }

    chrome.debugger.onEvent.addListener(handleDebuggerEvent);
    chrome.debugger.onDetach.addListener(handleDebuggerDetach);
    state.debuggerEventsBound = true;
  }

    function syncWebSocketToggle(checked) {
      state.webSocketCaptureEnabled = checked;
      dom.websocketToggle.checked = checked;
    }

    async function updateWebSocketCaptureState(enabled) {
      syncWebSocketToggle(enabled);

      if (!enabled) {
        await detachWebSocketDebugger();
        setCaptureStatus("");
        return;
      }

      if (!window.chrome?.debugger) {
        syncWebSocketToggle(false);
        setCaptureStatus("当前环境无法启用 WebSocket 消息捕获。");
        return;
      }

      await ensureWebSocketDebuggerAttached();
  }

  async function ensureWebSocketDebuggerAttached() {
      if (
        !state.webSocketCaptureEnabled ||
        state.debuggerAttached ||
        state.debuggerPending ||
        !Number.isInteger(state.inspectedTabId)
      ) {
      return;
    }

    state.debuggerPending = true;

    try {
      await attachDebugger({ tabId: state.inspectedTabId });
      await sendDebuggerCommand("Network.enable");
      state.debuggerAttached = true;
      setCaptureStatus("WebSocket 消息捕获已启用。Chrome 可能会在页面顶部显示调试提示。");
    } catch (error) {
      state.debuggerAttached = false;
        syncWebSocketToggle(false);
      setCaptureStatus(`WebSocket 消息捕获启用失败：${error.message}`);
    } finally {
      state.debuggerPending = false;
    }
  }

  async function detachWebSocketDebugger(options) {
    const silent = Boolean(options?.silent);

    if (!state.debuggerAttached || !Number.isInteger(state.inspectedTabId) || !window.chrome?.debugger) {
      state.debuggerAttached = false;
      state.debuggerPending = false;
        if (!silent && state.webSocketCaptureEnabled) {
          setCaptureStatus("WebSocket 调试未处于连接状态。");
      }
      return;
    }

    try {
      await detachDebugger({ tabId: state.inspectedTabId });
    } catch (error) {
      // Ignore detach failures during cleanup.
    }

    state.debuggerAttached = false;
    state.debuggerPending = false;

    if (!silent) {
        setCaptureStatus("WebSocket 调试连接已断开。");
    }
  }

  function handleDebuggerEvent(source, method, params) {
      if (!state.webSocketCaptureEnabled || source.tabId !== state.inspectedTabId) {
      return;
    }

    if (method === "Network.webSocketCreated") {
      handleWebSocketCreated(params);
      return;
    }

    if (method === "Network.webSocketWillSendHandshakeRequest") {
      handleWebSocketHandshakeRequest(params);
      return;
    }

    if (method === "Network.webSocketHandshakeResponseReceived") {
      handleWebSocketHandshakeResponse(params);
      return;
    }

    if (method === "Network.webSocketFrameSent") {
      handleWebSocketFrame(params, "sent");
      return;
    }

    if (method === "Network.webSocketFrameReceived") {
      handleWebSocketFrame(params, "received");
      return;
    }

    if (method === "Network.webSocketClosed") {
      handleWebSocketClosed(params);
      return;
    }

    if (method === "Network.webSocketFrameError") {
      handleWebSocketFrameError(params);
    }
  }

  function handleDebuggerDetach(source, reason) {
    if (source.tabId !== state.inspectedTabId) {
      return;
    }

    state.debuggerAttached = false;
    state.debuggerPending = false;
      syncWebSocketToggle(false);
    setCaptureStatus(`WebSocket 调试连接已断开：${reason}`);
  }

  function handleWebSocketCreated(params) {
    const entry = ensureWebSocketEntry(params.requestId, params.url);

    entry.url = params.url || entry.url;
    entry.queryString = parseQueryString(entry.url);
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function handleWebSocketHandshakeRequest(params) {
    const entry = ensureWebSocketEntry(params.requestId, params.request?.url);
    const requestHeaders = headerPairsFromObject(params.request?.headers);
    const createdAtMs = resolveEventTimeMs(entry, params.timestamp, params.wallTime) || Date.now();

    initializeWebSocketTimeOrigin(entry, params.timestamp, params.wallTime);
    entry.url = params.request?.url || entry.url;
    entry.queryString = parseQueryString(entry.url);
    entry.requestHeaders = requestHeaders;
    entry.startedDateTime = formatTimestamp(createdAtMs) || entry.startedDateTime;
    entry.websocket.createdAtMs = createdAtMs;
    entry.websocket.lastEventAtMs = createdAtMs;
    entry.websocket.state = "connecting";
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function handleWebSocketHandshakeResponse(params) {
    const entry = ensureWebSocketEntry(params.requestId, "");
    const responseHeaders = headerPairsFromObject(params.response?.headers);
    const connectedAtMs = resolveEventTimeMs(entry, params.timestamp, null) || Date.now();

    entry.status = params.response?.status || entry.status;
    entry.statusText = params.response?.statusText || entry.statusText;
    entry.responseHeaders = responseHeaders;
    entry.websocket.protocol = getHeaderValue(responseHeaders, "sec-websocket-protocol");
    entry.websocket.extensions = getHeaderValue(responseHeaders, "sec-websocket-extensions");
    entry.websocket.connectedAtMs = connectedAtMs;
    entry.websocket.lastEventAtMs = connectedAtMs;
    entry.websocket.state = entry.status === 101 ? "open" : "failed";
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function handleWebSocketFrame(params, direction) {
    const entry = ensureWebSocketEntry(params.requestId, "");
    const frame = createWebSocketFrame(entry, direction, params.response, params.timestamp);

    entry.websocket.frames.unshift(frame);
    entry.websocket.frames = entry.websocket.frames.slice(0, MAX_WEBSOCKET_FRAMES);
    entry.websocket.lastEventAtMs = frame.timeMs;

    if (direction === "sent") {
      entry.websocket.sentCount += 1;
    } else {
      entry.websocket.receivedCount += 1;
    }

    if (entry.websocket.state === "connecting") {
      entry.websocket.state = "open";
    }

    if (!entry.websocket.selectedFrameId) {
      entry.websocket.selectedFrameId = frame.id;
    }

    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function handleWebSocketClosed(params) {
    const entry = ensureWebSocketEntry(params.requestId, "");
    const closedAtMs = resolveEventTimeMs(entry, params.timestamp, null) || Date.now();

    entry.websocket.closedAtMs = closedAtMs;
    entry.websocket.lastEventAtMs = closedAtMs;
    entry.websocket.state = entry.websocket.errorText ? "failed" : "closed";
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function handleWebSocketFrameError(params) {
    const entry = ensureWebSocketEntry(params.requestId, "");

    entry.websocket.errorText = params.errorMessage || "Unknown WebSocket error";
    entry.websocket.state = "failed";
    entry.websocket.lastEventAtMs = Date.now();
    resetFormattedCache(entry);
    refreshEntry(entry);
  }

  function initializeWebSocketTimeOrigin(entry, timestamp, wallTime) {
    if (
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      entry.websocket.timeOriginTimestamp === null
    ) {
      entry.websocket.timeOriginTimestamp = timestamp;
    }

    if (
      typeof wallTime === "number" &&
      Number.isFinite(wallTime) &&
      entry.websocket.timeOriginWallTimeMs === null
    ) {
      entry.websocket.timeOriginWallTimeMs = wallTime * 1000;
    }
  }

  function resolveEventTimeMs(entry, timestamp, wallTime) {
    if (typeof wallTime === "number" && Number.isFinite(wallTime)) {
      return wallTime * 1000;
    }

    if (
      typeof timestamp === "number" &&
      Number.isFinite(timestamp) &&
      typeof entry.websocket?.timeOriginTimestamp === "number" &&
      typeof entry.websocket?.timeOriginWallTimeMs === "number"
    ) {
      return entry.websocket.timeOriginWallTimeMs + (timestamp - entry.websocket.timeOriginTimestamp) * 1000;
    }

    return null;
  }

  function isWebSocketHandshakeRequest(request) {
    const har = request || {};
    const requestUrl = String(har.request?.url || "");
    const requestHeaders = har.request?.headers || [];
    const responseHeaders = har.response?.headers || [];
    const upgradeRequest = getHeaderValue(requestHeaders, "upgrade");
    const upgradeResponse = getHeaderValue(responseHeaders, "upgrade");

    return (
      requestUrl.startsWith("ws://") ||
      requestUrl.startsWith("wss://") ||
      String(upgradeRequest).toLowerCase() === "websocket" ||
      String(upgradeResponse).toLowerCase() === "websocket" ||
      har.response?.status === 101
    );
  }

  function attachDebugger(debuggee) {
    return new Promise(function attachPromise(resolve, reject) {
      chrome.debugger.attach(debuggee, DEBUGGER_PROTOCOL_VERSION, function onAttach() {
        const error = chrome.runtime?.lastError;

        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function detachDebugger(debuggee) {
    return new Promise(function detachPromise(resolve, reject) {
      chrome.debugger.detach(debuggee, function onDetach() {
        const error = chrome.runtime?.lastError;

        if (error) {
          reject(new Error(error.message));
          return;
        }

        resolve();
      });
    });
  }

  function sendDebuggerCommand(method, commandParams) {
    return new Promise(function sendCommandPromise(resolve, reject) {
      chrome.debugger.sendCommand(
        { tabId: state.inspectedTabId },
        method,
        commandParams || {},
        function onCommand(result) {
          const error = chrome.runtime?.lastError;

          if (error) {
            reject(new Error(error.message));
            return;
          }

          resolve(result);
        }
      );
    });
  }

  bindEvents();
  render();
  startCapture();
})();
