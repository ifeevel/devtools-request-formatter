# AGENTS.md

This file guides coding agents working in this repository.

## Project Overview

`devtools-request-formatter` is a zero-build Chrome DevTools extension for formatting HTTP requests, responses, and WebSocket messages inside a custom DevTools panel.

The extension is intentionally small and dependency-free. Runtime files live at the repository root and are loaded directly by Chrome.

## Architecture

- `manifest.json`: Chrome Manifest V3 metadata, permissions, icons, and DevTools entry.
- `devtools.html` / `devtools.js`: registers the DevTools panel.
- `panel.html`: panel markup and static DOM structure.
- `panel.css`: all panel styling and theme variables.
- `panel.js`: main HTTP panel state, event wiring, rendering coordination, and detail tabs.
- `panel-websocket.js`: WebSocket capture, state, rendering, and Chrome debugger integration.
- `formatters.js`: pure formatting helpers for query strings, headers, payloads, timestamps, and WebSocket support data.
- `copyable-detail.js`: click-to-copy token rendering and copy hint behavior for HTTP detail fields.
- `detail-search.js`: in-detail search UI, highlighting, and keyboard navigation.
- `i18n.js`: centralized runtime text lookup and fallback messages.
- `theme.js`: DevTools/system theme synchronization.
- `_locales/`: Chrome extension locale message files.
- `scripts/package.sh`: local release zip packaging.

## Coding Rules

- Keep the project zero-build. Do not add bundlers, package managers, transpilers, frameworks, or generated build artifacts unless explicitly requested.
- Use native JavaScript ESM and browser APIs. Prefer small functions and existing local helpers over new abstractions.
- Keep changes scoped to the feature or bug being handled. Avoid unrelated refactors.
- Preserve raw request and response data. Do not `trim()` or otherwise mutate user-visible or copied payload data unless the code is only using a separate detection string.
- When formatting structured data, use browser-standard parsers such as `URL`, `URLSearchParams`, and `JSON.parse` instead of ad hoc string parsing where practical.
- Follow the existing style: two-space indentation, semicolons, double quotes, named function expressions for callbacks where the surrounding file uses them.
- Add comments only for non-obvious logic, especially around Chrome DevTools API limitations, WebSocket debugger behavior, or data preservation.

## UI And CSS

- Do not use Tailwind or external CSS frameworks.
- Keep styles in `panel.css` unless a new standalone page is introduced.
- Use existing `--rf-*` CSS custom properties for colors and theme-aware values.
- Prefer `rem` units for spacing, sizing, borders, and radii.
- Keep the DevTools panel compact, symmetric, and information-dense. Avoid large empty areas.
- For long text, prefer CSS constraints such as `max-height` and internal scrolling over JavaScript expand/collapse state unless the interaction requires state.
- HTTP status codes `>= 400` should use `--rf-danger` for color and should not be bolded solely because of the error state.

## Internationalization

- User-facing strings belong in `i18n.js` fallback messages and, when used by Chrome extension APIs or static extension metadata, in `_locales/en/messages.json` and `_locales/zh_CN/messages.json`.
- For static DOM text, prefer `data-i18n` and `data-i18n-attrs` with `applyStaticI18n`.
- Keep English and Simplified Chinese messages aligned when adding or changing text.

## Data Fidelity And Copy Behavior

- Copy output must preserve original values exactly unless the user explicitly requested formatted output.
- Do not strip leading/trailing whitespace from raw payloads used for display or copy.
- It is acceptable to create a separate trimmed detection value for JSON or form detection, as `formatPayload` does, while returning or copying the unmodified source when parsing is not applied.
- Duplicate query/header keys are represented as arrays through `objectFromPairs`; preserve that behavior.
- Inline copy tokens are implemented in `copyable-detail.js`; reuse that path for copyable field objects instead of duplicating DOM behavior.

## Chrome DevTools Constraints

- HTTP response body availability depends on Chrome DevTools API behavior. Handle missing or delayed content gracefully.
- WebSocket capture depends on the `chrome.debugger` permission and may show Chrome's browser-level debugging notice.
- Keep WebSocket retention bounded. The current behavior keeps at most the latest `500` messages per connection to protect panel responsiveness.
- Do not request broader Chrome permissions without a concrete need.

## Verification

There is no build step and no automated test suite in this repository.

Before finishing a change, run the checks that fit the edit:

```bash
bash scripts/package.sh
```

Manual smoke test for UI changes:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Load this repository as an unpacked extension.
4. Open DevTools on a test page and select the `Request Formatter` panel.
5. Trigger HTTP requests and, when relevant, WebSocket traffic.
6. Verify formatting, copy behavior, search behavior, theme switching, and narrow viewport behavior as applicable.

For syntax-only JavaScript validation, use:

```bash
node --check panel.js
node --check panel-websocket.js
node --check formatters.js
node --check copyable-detail.js
node --check detail-search.js
node --check i18n.js
node --check theme.js
node --check devtools.js
```

## Packaging

Use:

```bash
bash scripts/package.sh
```

The script reads `manifest.json` `version` and writes:

```text
release/devtools-request-formatter-v<version>.zip
```

Do not commit `release/` artifacts unless the user explicitly asks for packaged output to be included.

