const SKIPPED_HEADER_NAMES = new Set([
  "content-length"
]);

export function formatCurlCommand(entry) {
  if (!entry || entry.kind !== "http" || !entry.url) {
    return "";
  }

  const lines = [`curl ${quoteShellValue(entry.url)}`];
  const method = String(entry.method || "GET").toUpperCase();
  const body = getRequestBody(entry.requestPostData);

  if (method !== "GET" || body !== null) {
    lines.push(`-X ${quoteShellValue(method)}`);
  }

  getCurlHeaders(entry.requestHeaders).forEach(function appendHeader(header) {
    lines.push(`-H ${quoteShellValue(`${header.name}: ${header.value}`)}`);
  });

  if (body !== null) {
    lines.push(`--data-raw ${quoteShellValue(body)}`);
  }

  return lines.map(function formatLine(line, index) {
    return index === 0 ? line : `  ${line}`;
  }).join(" \\\n");
}

function getCurlHeaders(headers) {
  if (!Array.isArray(headers)) {
    return [];
  }

  return headers.filter(function canCopyHeader(header) {
    const name = String(header?.name || "");
    const normalizedName = name.toLowerCase();

    return Boolean(name) &&
      !normalizedName.startsWith(":") &&
      !SKIPPED_HEADER_NAMES.has(normalizedName);
  }).map(function normalizeHeader(header) {
    return {
      name: String(header.name),
      value: String(header.value ?? "")
    };
  });
}

function getRequestBody(postData) {
  if (!postData) {
    return null;
  }

  if (Object.prototype.hasOwnProperty.call(postData, "text")) {
    return String(postData.text ?? "");
  }

  const mimeType = String(postData.mimeType || "").toLowerCase();

  if (
    !mimeType.includes("application/x-www-form-urlencoded") ||
    !Array.isArray(postData.params) ||
    postData.params.length === 0
  ) {
    return null;
  }

  const params = new URLSearchParams();

  postData.params.forEach(function appendParam(param) {
    params.append(String(param?.name ?? ""), String(param?.value ?? ""));
  });
  return params.toString();
}

function quoteShellValue(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}
