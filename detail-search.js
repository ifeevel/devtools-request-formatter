export function createController(options) {
  const documentValue = options?.documentValue || globalThis.document;
  const windowValue = options?.windowValue || globalThis.window;
  const translate = typeof options?.t === "function" ? options.t : function passthrough(key) {
    return key;
  };
  const requestRender = typeof options?.onQueryChange === "function"
    ? options.onQueryChange
    : typeof options?.onRequestRender === "function"
      ? options.onRequestRender
      : function noop() {};
  const state = {
    text: "",
    visible: false,
    activeIndex: 0,
    matchCount: 0,
    activeElement: null,
    renderCursor: 0,
    renderDepth: 0
  };
  const dom = {
    bar: documentValue.querySelector(".request-formatter-detail-search"),
    input: documentValue.getElementById("detail-search"),
    close: documentValue.getElementById("detail-search-close"),
    count: documentValue.getElementById("detail-search-count"),
    next: documentValue.getElementById("detail-search-next"),
    prev: documentValue.getElementById("detail-search-prev")
  };
  const searchRoot = options?.searchRoot
    || documentValue.getElementById("detail-view")
    || documentValue.querySelector(".request-formatter-detail-view")
    || documentValue;

  function bindEvents() {
    dom.input.addEventListener("input", function searchDetail(event) {
      state.text = event.target.value;
      state.activeIndex = 0;
      requestRender();
    });

    dom.input.addEventListener("keydown", function handleSearchKeydown(event) {
      if (event.key !== "Enter") {
        return;
      }

      event.preventDefault();

      if (event.shiftKey) {
        activatePreviousMatch();
        return;
      }

      activateNextMatch();
    });

    dom.prev.addEventListener("click", activatePreviousMatch);
    dom.next.addEventListener("click", activateNextMatch);
    dom.close.addEventListener("click", hide);

    windowValue.addEventListener("keydown", function handleGlobalShortcuts(event) {
      if (isFindShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        show();
        return;
      }

      if (event.key === "Escape" && state.visible) {
        event.preventDefault();
        event.stopPropagation();
        hide();
      }
    }, true);
  }

  function beginRender() {
    if (!isActive()) {
      return;
    }

    state.renderDepth += 1;
    state.matchCount = 0;
    state.activeElement = null;
    state.renderCursor = 0;
  }

  function finalizeRender() {
    if (!isActive()) {
      return;
    }

    if (state.renderDepth > 0) {
      state.renderDepth -= 1;
    }

    if (state.renderDepth > 0) {
      return;
    }

    syncActiveMatch(true);
  }

  function renderPre(container, value) {
    if (!isActive()) {
      container.textContent = String(value ?? "");
      return {
        matchCount: 0,
        activeElement: null
      };
    }

    const result = renderHighlightedText(container, value, state.text, {
      activeIndex: state.activeIndex,
      globalStartIndex: state.renderCursor,
      documentValue
    });

    state.renderCursor += result.matchCount;
    state.matchCount = state.renderCursor;

    if (result.activeElement) {
      state.activeElement = result.activeElement;
    }
  }

  function resetMatches() {
    state.matchCount = 0;
    state.activeElement = null;
    state.renderCursor = 0;
    updateSummary();
  }

  function isActive() {
    return Boolean(state.text);
  }

  function updateSummary() {
    const hasQuery = Boolean(state.text);
    const matchCount = state.matchCount;

    dom.count.textContent = hasQuery && matchCount > 0
      ? translate("detailSearchCount", [state.activeIndex + 1, matchCount])
      : hasQuery
        ? translate("detailSearchNoMatches")
        : translate("detailSearchEmptyCount");

    dom.prev.disabled = !hasQuery || matchCount === 0;
    dom.next.disabled = !hasQuery || matchCount === 0;
  }

  function show() {
    state.visible = true;
    dom.bar.hidden = false;
    updateSummary();

    windowValue.requestAnimationFrame(function focusSearchInput() {
      dom.input.focus();
      dom.input.select();
    });
  }

  function hide() {
    state.visible = false;
    state.text = "";
    state.activeIndex = 0;
    dom.input.value = "";
    dom.bar.hidden = true;
    resetMatches();
    requestRender();
  }

  function activatePreviousMatch() {
    if (state.matchCount === 0) {
      return;
    }

    state.activeIndex = (state.activeIndex - 1 + state.matchCount) % state.matchCount;
    syncActiveMatch(true);
  }

  function activateNextMatch() {
    if (state.matchCount === 0) {
      return;
    }

    state.activeIndex = (state.activeIndex + 1) % state.matchCount;
    syncActiveMatch(true);
  }

  function getRenderedMatches() {
    const activePanel = searchRoot.querySelector(".request-formatter-tab-panel.is-active:not([hidden])");
    const scope = activePanel || searchRoot;
    return Array.from(scope.querySelectorAll(".request-formatter-search-match"));
  }

  function syncActiveMatch(shouldScroll) {
    if (!isActive()) {
      state.activeElement = null;
      updateSummary();
      return;
    }

    const matches = getRenderedMatches();
    const matchCount = matches.length;

    state.matchCount = matchCount;

    if (matchCount === 0) {
      state.activeIndex = 0;
      state.activeElement = null;
      updateSummary();
      return;
    }

    state.activeIndex = Math.max(0, Math.min(state.activeIndex, matchCount - 1));
    state.activeElement = null;

    matches.forEach(function updateMatchState(match, index) {
      const isActive = index === state.activeIndex;
      match.classList.toggle("is-active-search-match", isActive);

      if (isActive) {
        state.activeElement = match;
      }
    });

    updateSummary();

    if (shouldScroll && state.activeElement) {
      state.activeElement.scrollIntoView({
        block: "center",
        inline: "nearest"
      });
    }
  }

  function isFindShortcut(event) {
    return String(event.key || "").toLowerCase() === "f" && (event.ctrlKey || event.metaKey);
  }

  return {
    isActive,
    beginRender,
    bindEvents,
    finalizeRender,
    renderPre,
    resetMatches
  };
}

export function findMatches(text, query) {
  const source = String(text ?? "");
  const keyword = String(query ?? "");

  if (!keyword) {
    return [];
  }

  const normalizedSource = source.toLowerCase();
  const normalizedKeyword = keyword.toLowerCase();
  const matches = [];
  let index = normalizedSource.indexOf(normalizedKeyword);

  while (index >= 0) {
    matches.push({
      start: index,
      end: index + keyword.length
    });
    index = normalizedSource.indexOf(normalizedKeyword, index + keyword.length);
  }

  return matches;
}

export function renderHighlightedText(container, text, query, options) {
  const source = String(text ?? "");
  const matches = findMatches(source, query);
  const activeIndex = Number(options?.activeIndex) || 0;
  const globalStartIndex = Number(options?.globalStartIndex) || 0;
  const documentValue = options?.documentValue || container.ownerDocument;

  if (!query || matches.length === 0) {
    container.textContent = source;
    return {
      matchCount: matches.length,
      activeElement: null
    };
  }

  const fragment = documentValue.createDocumentFragment();
  let cursor = 0;
  let activeElement = null;

  matches.forEach(function appendMatch(match, index) {
    const globalIndex = globalStartIndex + index;

    fragment.append(documentValue.createTextNode(source.slice(cursor, match.start)));

    const mark = documentValue.createElement("mark");
    mark.className = "request-formatter-search-match";
    mark.textContent = source.slice(match.start, match.end);

    if (globalIndex === activeIndex) {
      mark.classList.add("is-active-search-match");
      activeElement = mark;
    }

    fragment.append(mark);
    cursor = match.end;
  });

  fragment.append(documentValue.createTextNode(source.slice(cursor)));
  container.replaceChildren(fragment);

  return {
    matchCount: matches.length,
    activeElement
  };
}
