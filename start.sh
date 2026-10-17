#!/usr/bin/env bash
# Prompt Forge - run on your own computer (macOS / Linux). ./start.sh [--production]
set -e
cd "$(dirname "$0")"
command -v node >/dev/null || { echo "Node.js 20+ is required: https://nodejs.org"; exit 1; }
[ -d node_modules ] || npm install --no-audit --no-fund
if [ "$1" = "--production" ]; then npm run build && npm run preview; else npm run dev; fi
