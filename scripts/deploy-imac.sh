#!/usr/bin/env bash
set -e

REMOTE_HOST="${IINA_EMBY_HOST:-192.168.1.115}"
REMOTE_TARGET="Library/Application Support/com.colliderli.iina/plugins/com.ghotriw.iina-emby.iinaplugin"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> Building iina-emby..."
pnpm run build

echo "==> Deploying to iMac ($REMOTE_HOST)..."
rsync -avz --delete \
  "$ROOT_DIR/dist/" \
  "$REMOTE_HOST:'$REMOTE_TARGET/dist/'"

rsync -avz \
  "$ROOT_DIR/dist/client/index.html" \
  "$ROOT_DIR/Info.json" \
  "$ROOT_DIR/pref.html" \
  "$ROOT_DIR/help.html" \
  "$REMOTE_HOST:'$REMOTE_TARGET/'"

echo "==> Reloading IINA on $REMOTE_HOST..."
ssh -o BatchMode=yes -o ConnectTimeout=3 "$REMOTE_HOST" "osascript -e 'tell application \"IINA\" to activate' -e 'tell application \"System Events\" to tell process \"IINA\" to keystroke \"r\" using {command down}' 2>/dev/null || true"

echo "==> Done! iina-emby successfully updated on $REMOTE_HOST."
