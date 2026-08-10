#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"

cd "$ROOT_DIR"

find src -type f -name "*.js" | sort | while IFS= read -r file; do
  node --check "$file"
done

node --check devtools.js
