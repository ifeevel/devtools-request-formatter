const LARGE_PAYLOAD_CHAR_LIMIT = 100000;
const PAYLOAD_PREVIEW_CHAR_LIMIT = 20000;

export function formatQuery(url, queryString) {
  const pairs = [];

  if (Array.isArray(queryString) && queryString.length > 0) {
    queryString.forEach(function pushQueryParam(param) {
      pairs.push([param.name, param.value]);
    });
  } else if (url) {
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

export function formatHeaders(headers) {
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

export function formatPayload(text, mimeType, options) {
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

export function formatDuration(duration, fallback) {
  if (typeof duration !== "number" || Number.isNaN(duration)) {
    return fallback;
  }

  if (duration >= 1000) {
    return `${(duration / 1000).toFixed(1)} s`;
  }

  return `${duration.toFixed(0)} ms`;
}

export function formatTimestamp(timestampMs) {
  if (typeof timestampMs !== "number" || Number.isNaN(timestampMs)) {
    return "";
  }

  return new Date(timestampMs).toISOString();
}

export function shortenUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname || "/"}${parsedUrl.search || ""}`;
  } catch (error) {
    return url || "Unknown URL";
  }
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function objectFromPairs(pairs) {
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
