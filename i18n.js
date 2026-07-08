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
  responseContentNotLoaded: {
    en: "Response content is not loaded yet. Select the Response tab to load it.",
    zh_CN: "响应内容尚未加载。请选择 Response 标签页加载。"
  },
  responseContentUnavailable: {
    en: "Response content is unavailable. Keep DevTools open and preserve the Network log when needed.",
    zh_CN: "响应内容不可用。需要保留内容时，请保持 DevTools 打开并保留 Network 日志。"
  },
  responseBase64Title: {
    en: "[Base64 encoded response]",
    zh_CN: "[Base64 编码响应]"
  },
  responseBase64Description: {
    en: "Chrome returned this response as base64. Decode it externally if it is binary data.",
    zh_CN: "Chrome 将此响应以 base64 返回。如果它是二进制数据，请在外部解码。"
  },
  payloadPreviewOnlyTitle: {
    en: "[Preview only] Payload is too large to fully format in the panel ($1 chars).",
    zh_CN: "[仅预览] Payload 过大，无法在面板中完整格式化（$1 字符）。"
  },
  payloadPreviewOnlyDescription: {
    en: "Only the first $1 chars are shown to keep the UI responsive.",
    zh_CN: "为保持界面响应，仅展示前 $1 个字符。"
  },
  websocketBinaryPayloadUnsupported: {
    en: "Binary frame ($1 bytes). Raw payload decoding is not supported. You can still copy the raw payload.",
    zh_CN: "Binary frame（$1 bytes）。暂不支持解析原始 payload，但仍可复制原始内容。"
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

function getFallbackLocale() {
  const locale = window.chrome?.i18n?.getUILanguage?.() || navigator.language || "en";
  return locale.toLowerCase().startsWith("zh") ? "zh_CN" : "en";
}

export function t(key, substitutions) {
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

export function applyStaticI18n(documentValue = document) {
  documentValue.documentElement.lang = getFallbackLocale() === "zh_CN" ? "zh-CN" : "en";

  documentValue.querySelectorAll("[data-i18n]").forEach(function translateText(element) {
    element.textContent = t(element.dataset.i18n);
  });

  documentValue.querySelectorAll("[data-i18n-attrs]").forEach(function translateAttributes(element) {
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
