import {
  objectFromPairs,
  parseQueryString
} from "./formatters.js";

const COPY_TOKEN_CLASS = "request-formatter-copy-token";

export function getHttpCopyFieldItems(entry, sectionKey) {
  if (!entry || entry.kind !== "http") {
    return [];
  }

  switch (sectionKey) {
    case "query":
      return createCopyFieldItemsFromPairs(getQueryFieldPairs(entry));
    case "requestHeaders":
      return createCopyFieldItemsFromPairs(entry.requestHeaders);
    case "responseHeaders":
      return createCopyFieldItemsFromPairs(entry.responseHeaders);
    default:
      return [];
  }
}

function getQueryFieldPairs(entry) {
  if (Array.isArray(entry.queryString) && entry.queryString.length > 0) {
    return entry.queryString;
  }

  return parseQueryString(entry.url);
}

function createCopyFieldItemsFromPairs(pairs) {
  if (!Array.isArray(pairs)) {
    return [];
  }

  const normalizedPairs = pairs
    .filter(function hasName(pair) {
      return Boolean(pair?.name);
    })
    .map(function toPair(pair) {
      return [String(pair.name), String(pair.value ?? "")];
    });

  return Object.entries(objectFromPairs(normalizedPairs)).map(function toFieldItem(pair) {
    const value = pair[1];

    if (Array.isArray(value)) {
      return {
        key: pair[0],
        valueKind: "merged",
        values: value
      };
    }

    return {
      key: pair[0],
      valueKind: "single",
      value
    };
  });
}

export function createCopyHintController(options) {
  const container = options.container;
  let tooltip = null;
  let activeToken = null;
  let restoreTimer = null;

  function ensureTooltip() {
    if (tooltip) {
      return;
    }

    tooltip = options.documentValue.createElement("div");
    tooltip.className = "request-formatter-copy-tooltip";
    tooltip.hidden = true;
    options.documentValue.body.append(tooltip);
  }

  function show(token, event, message) {
    ensureTooltip();
    activeToken = token;
    tooltip.textContent = message || options.t("copyFieldHint");
    tooltip.hidden = false;
    positionTooltip(event);
  }

  function hide(token) {
    if (!tooltip || tooltip.hidden) {
      return;
    }

    if (token && activeToken !== token) {
      return;
    }

    tooltip.hidden = true;
    activeToken = null;
  }

  function positionTooltip(event) {
    const margin = 8;
    const tooltipRect = tooltip.getBoundingClientRect();
    const preferredLeft = event.clientX - tooltipRect.width / 2;
    const left = Math.max(margin, Math.min(preferredLeft, options.windowValue.innerWidth - tooltipRect.width - margin));
    const top = Math.max(margin, event.clientY - tooltipRect.height - 10);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
  }

  function bindEvents() {
    container.addEventListener("mouseover", function showCopyHint(event) {
      const token = findCopyToken(event.target);

      if (!token) {
        return;
      }

      show(token, event);
    });

    container.addEventListener("mousemove", function moveCopyHint(event) {
      const token = findCopyToken(event.target);

      if (!token || token !== activeToken) {
        return;
      }

      positionTooltip(event);
    });

    container.addEventListener("mouseout", function hideCopyHint(event) {
      const token = findCopyToken(event.target);

      if (!token || containsEventTarget(token, event.relatedTarget)) {
        return;
      }

      hide(token);
    });

    container.addEventListener("click", function copyInlineValue(event) {
      const token = findCopyToken(event.target);

      if (!token) {
        return;
      }

      options.copyText(token.dataset.copyValue || "")
        .then(function showCopied() {
          show(token, event, options.t("copiedButton"));
          scheduleRestore(token);
        })
        .catch(function showCopyFailed() {
          show(token, event, options.t("copyFailedButton"));
          scheduleRestore(token);
        });
    });

    options.windowValue.addEventListener("scroll", function hideOnScroll() {
      hide();
    }, true);
    options.windowValue.addEventListener("resize", function hideOnResize() {
      hide();
    });
  }

  function findCopyToken(target) {
    const ElementCtor = options.documentValue.defaultView?.Element;
    const NodeCtor = options.documentValue.defaultView?.Node;

    if (!ElementCtor || !NodeCtor || !(target instanceof NodeCtor)) {
      return null;
    }

    const element = target instanceof ElementCtor ? target : target.parentElement;
    const token = element?.closest(`.${COPY_TOKEN_CLASS}`);
    return token && container.contains(token) ? token : null;
  }

  function containsEventTarget(element, target) {
    const NodeCtor = options.documentValue.defaultView?.Node;

    return Boolean(NodeCtor && target instanceof NodeCtor && element.contains(target));
  }

  function scheduleRestore(token) {
    options.windowValue.clearTimeout(restoreTimer);
    restoreTimer = options.windowValue.setTimeout(function restoreHint() {
      if (activeToken === token) {
        tooltip.textContent = options.t("copyFieldHint");
      }
    }, 900);
  }

  return {
    bindEvents,
    hide
  };
}

export function renderCopyableFieldObject(container, items) {
  const documentValue = container.ownerDocument;
  const fragment = documentValue.createDocumentFragment();

  fragment.append("{");
  items.forEach(function appendItem(item, itemIndex) {
    fragment.append("\n  ");
    appendCopyToken(fragment, documentValue, JSON.stringify(item.key), item.key);
    fragment.append(": ");

    if (item.valueKind === "merged") {
      appendMergedValueArray(fragment, documentValue, item.values);
    } else {
      appendCopyToken(fragment, documentValue, JSON.stringify(item.value), item.value);
    }

    if (itemIndex < items.length - 1) {
      fragment.append(",");
    }
  });
  fragment.append(items.length > 0 ? "\n}" : "}");
  container.replaceChildren(fragment);
}

function appendMergedValueArray(fragment, documentValue, values) {
  fragment.append("[");
  values.forEach(function appendArrayValue(value, index) {
    fragment.append(index === 0 ? "\n    " : ",\n    ");
    appendCopyToken(fragment, documentValue, JSON.stringify(value), value);
  });
  fragment.append("\n  ]");
}

function appendCopyToken(fragment, documentValue, text, value) {
  const token = documentValue.createElement("span");

  token.className = COPY_TOKEN_CLASS;
  token.dataset.copyValue = value;
  token.textContent = text;
  fragment.append(token);
}