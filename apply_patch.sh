#!/usr/bin/env bash
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERROR] Node.js is required on PATH."
  exit 1
fi

echo "Closing Antigravity (if running)..."
pkill -f "Antigravity" >/dev/null 2>&1 || true
sleep 1

node "$DIR/src/build.js" --install
node "$DIR/src/verify.js"

echo "Done. You can relaunch Antigravity now."
