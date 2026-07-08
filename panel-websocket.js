const MAX_WEBSOCKET_FRAMES = 500;
const WEBSOCKET_MESSAGES_FILTER_RENDER_DELAY = 60;
const DEBUGGER_PROTOCOL_VERSION = "1.3";
const WEBSOCKET_MIME_TYPE = "WebSocket";
const WEBSOCKET_DEFAULT_PROTOCOL_LABEL = "WebSocket";

export function createState(options) {
    return {
      webSocketCaptureEnabled: false,
      webSocketEntryIdsByRequestId: new Map(),
      inspectedTabId: options?.inspectedTabId ?? null,
      debuggerEventsBound: false,
      debuggerAttached: false,
      debuggerPending: false,
      wsMessagesRenderFrame: 0,
      wsMessagesRenderTimer: 0,
      wsMessagesRenderEntryId: null,
      wsRenderedEntryId: null,
      wsRenderedFilterText: "",
      wsRenderedFrameIds: [],
      wsRenderedSelectedFrameId: null,
      wsMessageItemMap: new Map()
    };
  }

export function createDomRefs(documentValue) {
    return {
      websocketToggle: documentValue.getElementById("websocket-toggle"),
      wsMessageFilter: documentValue.getElementById("ws-message-filter"),
      wsMessageList: documentValue.getElementById("ws-message-list"),
      wsMessageMeta: documentValue.getElementById("ws-message-meta"),
      wsMessageOutput: documentValue.getElementById("ws-message-output"),
      wsMessageSummary: documentValue.getElementById("ws-message-summary"),
      wsOverviewOutput: documentValue.getElementById("ws-overview-output"),
      wsQueryOutput: documentValue.getElementById("ws-query-output"),
      wsRequestHeadersOutput: documentValue.getElementById("ws-request-headers-output"),
      wsResponseHeadersOutput: documentValue.getElementById("ws-response-headers-output"),
      wsTimingOutput: documentValue.getElementById("ws-timing-output")
    };
  }

export function createController(deps) {
    const {
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
      setCaptureStatus
    } = deps;

    function createEntry(requestId, url) {
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
      switch (key) {
        case "query":
          return deps.formatQuery(entry.url, entry.queryString);
        case "requestHeaders":
          return deps.formatHeaders(entry.requestHeaders);
        case "responseHeaders":
          return deps.formatHeaders(entry.responseHeaders);
        case "timing":
          return formatTiming(entry);
        case "wsOverview":
          return formatOverview(entry);
        case "wsMessage":
          return formatSelectedMessage(entry, options);
        default:
          return "";
      }
    }

    function formatTiming(entry) {
      const socket = entry.websocket;

      return JSON.stringify(
        {
          startedDateTime: entry.startedDateTime || "Unknown",
          state: socket.state,
          createdAt: formatTimestamp(socket.createdAtMs),
          connectedAt: formatTimestamp(socket.connectedAtMs),
          closedAt: formatTimestamp(socket.closedAtMs),
          lastEventAt: formatTimestamp(socket.lastEventAtMs),
          durationMs: getDuration(entry),
          framesKept: socket.frames.length,
          framesLimit: MAX_WEBSOCKET_FRAMES
        },
        null,
        2
      );
    }

    function formatOverview(entry) {
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
          durationMs: getDuration(entry)
        },
        null,
        2
      );
    }

    function formatSelectedMessage(entry, options) {
      const frame = getSelectedFrame(entry);

      if (!frame) {
        return "No message selected";
      }

      const payload = formatFramePayload(frame, options);

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

    function formatFramePayload(frame, options) {
      if (frame.type === "binary") {
        return `Binary frame (${frame.size.toLocaleString()} bytes). Raw payload decoding is not supported in v1.`;
      }

      if (frame.type === "ping" || frame.type === "pong" || frame.type === "close") {
        return frame.payloadData || "No payload";
      }

      return formatPayload(
        frame.payloadData,
        frame.type === "json" ? "application/json" : "text/plain",
          { ...options, preserveWhitespace: true }
      );
    }

    function cleanupEntry(entry) {
      state.webSocketEntryIdsByRequestId.delete(entry.websocket.requestId);
    }

    function renderActiveTabContent(entry) {
      const activeTab = getActiveTab("websocket");

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
        renderMessages(entry);
        return;
      }

      if (activeTab === "timing") {
        dom.wsTimingOutput.textContent = getFormattedValue(entry, "timing");
      }
    }

    function renderMessages(entry) {
      const frames = getFilteredFrames(entry);
      const selectedFrame = ensureSelectedFrame(entry, frames);

      dom.wsMessageFilter.value = entry.websocket.frameFilterText;
      renderMessageSummary(entry, frames.length);
      renderMessageList(entry, frames);
      renderMessageDetail(entry, selectedFrame);
    }

    function renderMessageSummary(entry, filteredCount) {
      dom.wsMessageSummary.textContent = filteredCount === entry.websocket.frames.length
        ? t("websocketSummaryAll", [filteredCount, MAX_WEBSOCKET_FRAMES])
        : t("websocketSummaryFiltered", [filteredCount, entry.websocket.frames.length]);
    }

    function renderMessageDetail(entry, selectedFrame) {
      if (!selectedFrame) {
        dom.wsMessageMeta.textContent = t("noMessageSelected");
        dom.wsMessageOutput.textContent = t("noMessageSelected");
        return;
      }

      dom.wsMessageMeta.textContent = [
        selectedFrame.direction === "sent" ? "Sent" : "Received",
        selectedFrame.type,
        `${selectedFrame.size.toLocaleString()} bytes`,
        formatTimestamp(selectedFrame.timeMs) || "Unknown time"
      ].join(" · ");
      dom.wsMessageOutput.textContent = formatSelectedMessage(entry);
    }

    function renderMessageList(entry, frames) {
      const selectedFrameId = entry.websocket.selectedFrameId;
      const filterText = entry.websocket.frameFilterText.trim();

      if (frames.length === 0) {
        renderEmptyMessageList();
        syncRenderedMessageListState(entry, [], selectedFrameId);
        return;
      }

      if (shouldIncrementallyRenderMessageList(entry, filterText, frames)) {
        incrementallyRenderMessageList(frames, selectedFrameId);
        syncRenderedMessageListState(entry, frames, selectedFrameId);
        return;
      }

      rebuildMessageList(entry, frames, selectedFrameId);
    }

    function renderEmptyMessageList() {
      const empty = document.createElement("div");
      empty.className = "request-formatter-inline-empty";
      empty.textContent = t("noMatchingMessages");
      dom.wsMessageList.replaceChildren(empty);
      state.wsMessageItemMap.clear();
    }

    function rebuildMessageList(entry, frames, selectedFrameId) {
      const fragment = document.createDocumentFragment();

      state.wsMessageItemMap.clear();

      frames.forEach(function appendFrame(frame) {
        const item = createFrameItem(frame, selectedFrameId);
        state.wsMessageItemMap.set(frame.id, item);
        fragment.append(item);
      });

      dom.wsMessageList.replaceChildren(fragment);
      syncRenderedMessageListState(entry, frames, selectedFrameId);
    }

    function shouldIncrementallyRenderMessageList(entry, filterText, frames) {
      if (filterText) {
        return false;
      }

      if (
        state.wsRenderedEntryId !== entry.id ||
        state.wsRenderedFilterText ||
        state.wsRenderedFrameIds.length === 0
      ) {
        return false;
      }

      if (dom.wsMessageList.firstElementChild?.classList.contains("request-formatter-inline-empty")) {
        return false;
      }

      return getIncrementalMessageListPlan(frames) !== null;
    }

    function getIncrementalMessageListPlan(frames) {
      const previousFrameIds = state.wsRenderedFrameIds;
      const nextFrameIds = frames.map(function getFrameId(frame) {
        return frame.id;
      });

      if (previousFrameIds.length === 0) {
        return null;
      }

      const anchorIndex = nextFrameIds.indexOf(previousFrameIds[0]);

      if (anchorIndex < 0) {
        return null;
      }

      const overlapCount = Math.min(previousFrameIds.length, nextFrameIds.length - anchorIndex);

      for (let index = 0; index < overlapCount; index += 1) {
        if (nextFrameIds[anchorIndex + index] !== previousFrameIds[index]) {
          return null;
        }
      }

      return {
        prependFrames: frames.slice(0, anchorIndex),
        removedFrameIds: previousFrameIds.slice(overlapCount)
      };
    }

    function incrementallyRenderMessageList(frames, selectedFrameId) {
      const plan = getIncrementalMessageListPlan(frames);

      if (!plan) {
        return;
      }

      if (plan.prependFrames.length > 0) {
        const fragment = document.createDocumentFragment();

        plan.prependFrames.forEach(function prependFrame(frame) {
          const item = createFrameItem(frame, selectedFrameId);
          state.wsMessageItemMap.set(frame.id, item);
          fragment.append(item);
        });

        dom.wsMessageList.prepend(fragment);
      }

      plan.removedFrameIds.forEach(function removeFrame(frameId) {
        state.wsMessageItemMap.get(frameId)?.remove();
        state.wsMessageItemMap.delete(frameId);
      });

      updateRenderedMessageSelection(selectedFrameId, state.wsRenderedSelectedFrameId);
    }

    function updateRenderedMessageSelection(nextFrameId, previousFrameId) {
      if (previousFrameId && previousFrameId !== nextFrameId) {
        state.wsMessageItemMap.get(previousFrameId)?.classList.remove("is-active");
      }

      if (nextFrameId) {
        state.wsMessageItemMap.get(nextFrameId)?.classList.add("is-active");
      }
    }

    function syncRenderedMessageListState(entry, frames, selectedFrameId) {
      state.wsRenderedEntryId = entry.id;
      state.wsRenderedFilterText = entry.websocket.frameFilterText.trim();
      state.wsRenderedFrameIds = frames.map(function getFrameId(frame) {
        return frame.id;
      });
      state.wsRenderedSelectedFrameId = selectedFrameId || null;
    }

    function resetRenderedMessageListState() {
      state.wsRenderedEntryId = null;
      state.wsRenderedFilterText = "";
      state.wsRenderedFrameIds = [];
      state.wsRenderedSelectedFrameId = null;
      state.wsMessageItemMap.clear();
    }

    function cancelScheduledMessagesRender() {
      if (state.wsMessagesRenderFrame) {
        window.cancelAnimationFrame(state.wsMessagesRenderFrame);
        state.wsMessagesRenderFrame = 0;
      }

      if (state.wsMessagesRenderTimer) {
        window.clearTimeout(state.wsMessagesRenderTimer);
        state.wsMessagesRenderTimer = 0;
      }
    }

    function flushScheduledMessagesRender() {
      state.wsMessagesRenderFrame = 0;
      state.wsMessagesRenderTimer = 0;

      const entry = getEntryById(state.wsMessagesRenderEntryId);

      if (
        !entry ||
        entry.kind !== "websocket" ||
        state.selectedId !== entry.id ||
        getActiveTab("websocket") !== "messages"
      ) {
        return;
      }

      deps.updateDetailMeta(entry);
      renderMessages(entry);
    }

    function scheduleMessagesRender(entryId, options) {
      const delayMs = Math.max(0, Number(options?.delayMs) || 0);

      state.wsMessagesRenderEntryId = entryId;

      if (delayMs > 0) {
        if (state.wsMessagesRenderFrame) {
          window.cancelAnimationFrame(state.wsMessagesRenderFrame);
          state.wsMessagesRenderFrame = 0;
        }

        if (state.wsMessagesRenderTimer) {
          window.clearTimeout(state.wsMessagesRenderTimer);
        }

        state.wsMessagesRenderTimer = window.setTimeout(function flushAfterDelay() {
          flushScheduledMessagesRender();
        }, delayMs);
        return;
      }

      if (state.wsMessagesRenderTimer) {
        window.clearTimeout(state.wsMessagesRenderTimer);
        state.wsMessagesRenderTimer = 0;
      }

      if (state.wsMessagesRenderFrame) {
        return;
      }

      state.wsMessagesRenderFrame = window.requestAnimationFrame(function flushOnFrame() {
        flushScheduledMessagesRender();
      });
    }

    function getFilteredFrames(entry) {
      const keyword = entry.websocket.frameFilterText.trim().toLowerCase();

      if (!keyword) {
        return entry.websocket.frames;
      }

      return entry.websocket.frames.filter(function filterFrame(frame) {
        return [frame.direction, frame.type, frame.payloadData].some(function includesKeyword(value) {
          return String(value || "").toLowerCase().includes(keyword);
        });
      });
    }

    function ensureSelectedFrame(entry, filteredFrames) {
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

    function getSelectedFrame(entry) {
      if (entry.kind !== "websocket") {
        return null;
      }

      return entry.websocket.frames.find(function findSelectedFrame(frame) {
        return frame.id === entry.websocket.selectedFrameId;
      }) || null;
    }

    function createFrameItem(frame, selectedFrameId) {
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
        `<p class="request-formatter-message-preview">${escapeHtml(getFramePreview(frame))}</p>`
      ].join("");

      return item;
    }

    function getFramePreview(frame) {
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

    function formatEntryType(entry) {
      return entry.websocket.protocol || WEBSOCKET_DEFAULT_PROTOCOL_LABEL;
    }

    function formatEntryDuration(entry) {
      return deps.formatDuration(getDuration(entry), "Connection time");
    }

    function getDuration(entry) {
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

    function matchesEntryFilter(entry, keyword) {
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

    function createListItemContent(entry) {
      return [
        '<div class="request-formatter-item-main">',
        '<span class="request-formatter-item-method is-websocket">WS</span>',
        `<span class="request-formatter-item-url">${escapeHtml(shortenUrl(entry.url))}</span>`,
        "</div>",
        '<div class="request-formatter-item-sub">',
        `<span>${escapeHtml(formatListStatus(entry))}</span>`,
        `<span>${escapeHtml(formatListSummary(entry))}</span>`,
        "</div>"
      ].join("");
    }

    function formatListStatus(entry) {
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

    function formatListSummary(entry) {
      return `↑ ${entry.websocket.sentCount} / ↓ ${entry.websocket.receivedCount}`;
    }

    function handleSelectedEntryRefresh(entry) {
      if (entry.kind !== "websocket" || getActiveTab("websocket") !== "messages") {
        return false;
      }

      scheduleMessagesRender(entry.id, {
        delayMs: entry.websocket.frameFilterText.trim()
          ? WEBSOCKET_MESSAGES_FILTER_RENDER_DELAY
          : 0
      });
      return true;
    }

    function bindUiEvents() {
      dom.websocketToggle.addEventListener("change", function updateWebSocketCapture(event) {
        updateCaptureState(event.target.checked).catch(function ignoreError() {});
      });

      dom.wsMessageFilter.addEventListener("input", function filterFrames(event) {
        const selected = getSelectedEntry();

        if (!selected || selected.kind !== "websocket") {
          return;
        }

        selected.websocket.frameFilterText = event.target.value;
        scheduleMessagesRender(selected.id, {
          delayMs: WEBSOCKET_MESSAGES_FILTER_RENDER_DELAY
        });
      });

      dom.wsMessageList.addEventListener("click", function selectFrame(event) {
        const selected = getSelectedEntry();
        const item = event.target.closest("[data-frame-id]");

        if (!selected || selected.kind !== "websocket" || !item) {
          return;
        }

        const previousFrameId = selected.websocket.selectedFrameId;
        selected.websocket.selectedFrameId = item.dataset.frameId;
        updateRenderedMessageSelection(selected.websocket.selectedFrameId, previousFrameId);
        state.wsRenderedSelectedFrameId = selected.websocket.selectedFrameId;
        renderMessageDetail(selected, getSelectedFrame(selected));
      });

      window.addEventListener("beforeunload", function cleanupCapture() {
        clearState();
        detachDebuggerSession({ silent: true }).catch(function ignoreError() {});
      });
    }

    function clearState() {
      cancelScheduledMessagesRender();
      resetRenderedMessageListState();
      state.webSocketEntryIdsByRequestId.clear();
    }

    function bindDebuggerEvents() {
      if (state.debuggerEventsBound || !window.chrome?.debugger?.onEvent) {
        return;
      }

      chrome.debugger.onEvent.addListener(handleDebuggerEvent);
      chrome.debugger.onDetach.addListener(handleDebuggerDetach);
      state.debuggerEventsBound = true;
    }

    function isHandshakeRequest(request) {
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

    function syncToggle(checked) {
      state.webSocketCaptureEnabled = checked;
      dom.websocketToggle.checked = checked;
    }

    async function updateCaptureState(enabled) {
      syncToggle(enabled);

      if (!enabled) {
        await detachDebuggerSession();
        setCaptureStatus("");
        return;
      }

      if (!window.chrome?.debugger) {
        syncToggle(false);
        setCaptureStatus(t("websocketUnavailable"));
        return;
      }

      await ensureDebuggerAttached();
    }

    async function ensureDebuggerAttached() {
      if (
        !state.webSocketCaptureEnabled ||
        state.debuggerAttached ||
        state.debuggerPending ||
        !Number.isInteger(state.inspectedTabId)
      ) {
        return;
      }

      state.debuggerPending = true;

      let attached = false;

      try {
        await attachDebugger({ tabId: state.inspectedTabId });
        attached = true;
        await sendDebuggerCommand("Network.enable");
        state.debuggerAttached = true;
        setCaptureStatus(t("websocketEnabled"));
      } catch (error) {
        if (attached) {
          try {
            await detachDebugger({ tabId: state.inspectedTabId });
          } catch (detachError) {
            // Best-effort cleanup after a partially enabled debugger session.
          }
        }

        state.debuggerAttached = false;
        syncToggle(false);
        setCaptureStatus(t("websocketEnableFailed", error.message));
      } finally {
        state.debuggerPending = false;
      }
    }

    async function detachDebuggerSession(options) {
      const silent = Boolean(options?.silent);

      if (!state.debuggerAttached || !Number.isInteger(state.inspectedTabId) || !window.chrome?.debugger) {
        state.debuggerAttached = false;
        state.debuggerPending = false;

        if (!silent && state.webSocketCaptureEnabled) {
          setCaptureStatus(t("websocketNotConnected"));
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
        setCaptureStatus(t("websocketDisconnected"));
      }
    }

    function handleDebuggerEvent(source, method, params) {
      if (!state.webSocketCaptureEnabled || source.tabId !== state.inspectedTabId) {
        return;
      }

      if (method === "Network.webSocketCreated") {
        handleCreated(params);
        return;
      }

      if (method === "Network.webSocketWillSendHandshakeRequest") {
        handleHandshakeRequest(params);
        return;
      }

      if (method === "Network.webSocketHandshakeResponseReceived") {
        handleHandshakeResponse(params);
        return;
      }

      if (method === "Network.webSocketFrameSent") {
        handleFrame(params, "sent");
        return;
      }

      if (method === "Network.webSocketFrameReceived") {
        handleFrame(params, "received");
        return;
      }

      if (method === "Network.webSocketClosed") {
        handleClosed(params);
        return;
      }

      if (method === "Network.webSocketFrameError") {
        handleFrameError(params);
      }
    }

    function handleDebuggerDetach(source, reason) {
      if (source.tabId !== state.inspectedTabId) {
        return;
      }

      state.debuggerAttached = false;
      state.debuggerPending = false;
      syncToggle(false);
      setCaptureStatus(t("websocketDisconnectedWithReason", reason));
    }

    function handleCreated(params) {
      const entry = ensureEntry(params.requestId, params.url);

      entry.url = params.url || entry.url;
      entry.queryString = parseQueryString(entry.url);
      resetFormattedCache(entry);
      refreshEntry(entry);
    }

    function handleHandshakeRequest(params) {
      const entry = ensureEntry(params.requestId, params.request?.url);
      const requestHeaders = headerPairsFromObject(params.request?.headers);
      const createdAtMs = resolveEventTimeMs(entry, params.timestamp, params.wallTime) || Date.now();

      initializeTimeOrigin(entry, params.timestamp, params.wallTime);
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

    function handleHandshakeResponse(params) {
      const entry = ensureEntry(params.requestId, "");
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

    function handleFrame(params, direction) {
      const entry = ensureEntry(params.requestId, "");
      const frame = createFrame(entry, direction, params.response, params.timestamp);

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

    function handleClosed(params) {
      const entry = ensureEntry(params.requestId, "");
      const closedAtMs = resolveEventTimeMs(entry, params.timestamp, null) || Date.now();

      entry.websocket.closedAtMs = closedAtMs;
      entry.websocket.lastEventAtMs = closedAtMs;
      entry.websocket.state = entry.websocket.errorText ? "failed" : "closed";
      resetFormattedCache(entry);
      refreshEntry(entry);
    }

    function handleFrameError(params) {
      const entry = ensureEntry(params.requestId, "");

      entry.websocket.errorText = params.errorMessage || "Unknown WebSocket error";
      entry.websocket.state = "failed";
      entry.websocket.lastEventAtMs = Date.now();
      resetFormattedCache(entry);
      refreshEntry(entry);
    }

    function ensureEntry(requestId, url) {
      const existingId = state.webSocketEntryIdsByRequestId.get(requestId);

      if (existingId) {
        return getEntryById(existingId);
      }

      const entry = createEntry(requestId, url);
      state.webSocketEntryIdsByRequestId.set(requestId, entry.id);
      addEntry(entry);
      return entry;
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

    function normalizeHeaderValue(value) {
      if (Array.isArray(value)) {
        return value.join(", ");
      }

      if (value === null || value === undefined) {
        return "";
      }

      return String(value);
    }

    function createFrame(entry, direction, response, timestamp) {
      const payloadData = String(response?.payloadData || "");
      const opcode = typeof response?.opcode === "number" ? response.opcode : -1;
      const type = getFrameType(payloadData, opcode);
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

    function getFrameType(payloadData, opcode) {
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

      if (String(payloadData || "").trim().startsWith("{") || String(payloadData || "").trim().startsWith("[")) {
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

    function initializeTimeOrigin(entry, timestamp, wallTime) {
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

    return {
      createEntry,
      getFormattedValue,
      cleanupEntry,
      renderActiveTabContent,
      formatEntryStatus,
      formatEntryType,
      formatEntryDuration,
      matchesEntryFilter,
      createListItemContent,
      handleSelectedEntryRefresh,
      bindUiEvents,
      bindDebuggerEvents,
      isHandshakeRequest,
      clearState
    };
  }
