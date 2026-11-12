#!/usr/bin/env bash
set -euo pipefail

RES_DIR=""
for cand in \
  "/Applications/Antigravity.app/Contents/Resources" \
  "$HOME/Applications/Antigravity.app/Contents/Resources" \
  "/opt/Antigravity/resources" \
  "/usr/lib/antigravity/resources" \
  "/usr/share/antigravity/resources" \
  "$HOME/.local/share/antigravity/resources"; do
  if [ -f "$cand/app.asar.bak" ]; then
    RES_DIR="$cand"
    break
  fi
done

if [ -z "$RES_DIR" ]; then
  echo "[ERROR] app.asar.bak not found."
  exit 1
fi

pkill -f "Antigravity" >/dev/null 2>&1 || true
sleep 1
cp -f "$RES_DIR/app.asar.bak" "$RES_DIR/app.asar"
echo "[SUCCESS] Restored original app.asar from $RES_DIR/app.asar.bak"
