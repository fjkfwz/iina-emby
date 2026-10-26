#!/usr/bin/env bash
set -e

# ==============================================================================
# iina-emby - One-Click Plugin Installer
# ==============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo -e "${BLUE}${BOLD}=== iina-emby Plugin Installer ===${NC}\n"

# 1. Check operating system
if [ "$(uname -s)" != "Darwin" ]; then
  echo -e "${RED}Error: IINA only supports macOS.${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$HOME/Library/Application Support/com.colliderli.iina/plugins/com.ghotriw.iina-emby.iinaplugin"

# 2. Check and build artifacts if missing
if [ ! -f "$ROOT_DIR/dist/client/index.html" ] || [ ! -f "$ROOT_DIR/dist/plugin/index.js" ]; then
  echo -e "${YELLOW}Missing build artifacts. Building project...${NC}"
  cd "$ROOT_DIR"
  if command -v pnpm &>/dev/null; then
    pnpm install && pnpm run build
  elif command -v npm &>/dev/null; then
    npm install && npm run build
  else
    echo -e "${RED}Error: Neither pnpm nor npm found. Please install Node.js and a package manager.${NC}"
    exit 1
  fi
fi

# 3. Install to IINA plugins directory
echo -e "Installing plugin to: ${BLUE}$TARGET_DIR${NC}"
mkdir -p "$TARGET_DIR"
cp -R "$ROOT_DIR/dist" "$TARGET_DIR/"
cp "$ROOT_DIR/Info.json" "$TARGET_DIR/"
cp "$ROOT_DIR/pref.html" "$TARGET_DIR/"
cp "$ROOT_DIR/help.html" "$TARGET_DIR/"

# 4. Check IINA installation and version compatibility
IINA_APP="/Applications/IINA.app"
if [ ! -d "$IINA_APP" ] && [ -d "$HOME/Applications/IINA.app" ]; then
  IINA_APP="$HOME/Applications/IINA.app"
fi

if [ -d "$IINA_APP" ]; then
  IINA_VER=$(defaults read "$IINA_APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")
  echo -e "Detected installed IINA version: ${BOLD}$IINA_VER${NC}"
  
  # Check if version >= 1.4.0
  MAJOR=$(echo "$IINA_VER" | cut -d. -f1)
  MINOR=$(echo "$IINA_VER" | cut -d. -f2)
  if [ "$MAJOR" -lt 1 ] || { [ "$MAJOR" -eq 1 ] && [ "$MINOR" -lt 4 ]; }; then
    echo -e "\n${YELLOW}⚠️  Warning: Current IINA version ($IINA_VER) is below 1.4.0.${NC}"
    echo -e "${YELLOW}IINA plugin system requires version 1.4.0 or higher. Please upgrade using:${NC}"
    echo -e "${BOLD}  brew install --cask iina${NC}"
    echo -e "Or download the latest release from: ${BLUE}https://iina.io${NC}\n"
  fi
else
  echo -e "\n${YELLOW}Notice: /Applications/IINA.app not found. Please ensure IINA 1.4.0+ is installed.${NC}"
fi

echo -e "\n${GREEN}${BOLD}✅ iina-emby plugin installed successfully!${NC}"
echo -e "If IINA is currently running, please restart IINA to apply changes."
