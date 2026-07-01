#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT_DIR="$ROOT_DIR/release"
VERSION="$(sed -nE 's/.*"version":[[:space:]]*"([^"]+)".*/\1/p' "$ROOT_DIR/manifest.json" | head -n 1)"

if [[ -z "$VERSION" ]]; then
  echo "Failed to read version from manifest.json" >&2
  exit 1
fi

ARCHIVE_NAME="devtools-request-formatter-v${VERSION}.zip"
ARCHIVE_PATH="$OUTPUT_DIR/$ARCHIVE_NAME"
FILES=(
  manifest.json
  devtools.html
  devtools.js
  panel.html
  panel.js
  panel.css
)

if [[ -d "$ROOT_DIR/icons" ]]; then
  FILES+=(icons)
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

cd "$ROOT_DIR"

zip -r "$ARCHIVE_PATH" "${FILES[@]}"

echo "Created $ARCHIVE_PATH"