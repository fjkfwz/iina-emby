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

echo -e "${BLUE}${BOLD}=== iina-emby 插件安装程序 ===${NC}\n"

# 1. 检查操作系统
if [ "$(uname -s)" != "Darwin" ]; then
  echo -e "${RED}错误：IINA 仅支持 macOS 系统。${NC}"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$HOME/Library/Application Support/com.colliderli.iina/plugins/com.ghotriw.iina-emby.iinaplugin"

# 2. 检查并构建产物 (如果缺少 dist)
if [ ! -f "$ROOT_DIR/dist/client/index.html" ] || [ ! -f "$ROOT_DIR/dist/plugin/index.js" ]; then
  echo -e "${YELLOW}检测到尚未构建产物，正在构建...${NC}"
  cd "$ROOT_DIR"
  if command -v pnpm &>/dev/null; then
    pnpm install && pnpm run build
  elif command -v npm &>/dev/null; then
    npm install && npm run build
  else
    echo -e "${RED}错误：未找到 pnpm 或 npm，请先安装 Node.js 与包管理器。${NC}"
    exit 1
  fi
fi

# 3. 安装到 IINA 插件目录
echo -e "正在安装插件到：${BLUE}$TARGET_DIR${NC}"
mkdir -p "$TARGET_DIR"
cp -R "$ROOT_DIR/dist" "$TARGET_DIR/"
cp "$ROOT_DIR/Info.json" "$TARGET_DIR/"
cp "$ROOT_DIR/pref.html" "$TARGET_DIR/"
cp "$ROOT_DIR/help.html" "$TARGET_DIR/"

# 4. 检查 IINA 安装与版本兼容性
IINA_APP="/Applications/IINA.app"
if [ ! -d "$IINA_APP" ] && [ -d "$HOME/Applications/IINA.app" ]; then
  IINA_APP="$HOME/Applications/IINA.app"
fi

if [ -d "$IINA_APP" ]; then
  IINA_VER=$(defaults read "$IINA_APP/Contents/Info.plist" CFBundleShortVersionString 2>/dev/null || echo "unknown")
  echo -e "检测到本机 IINA 版本：${BOLD}$IINA_VER${NC}"
  
  # 比较版本是否 >= 1.4.0
  MAJOR=$(echo "$IINA_VER" | cut -d. -f1)
  MINOR=$(echo "$IINA_VER" | cut -d. -f2)
  if [ "$MAJOR" -lt 1 ] || { [ "$MAJOR" -eq 1 ] && [ "$MINOR" -lt 4 ]; }; then
    echo -e "\n${YELLOW}⚠️  注意：当前 IINA 版本 ($IINA_VER) 低于 1.4.0。${NC}"
    echo -e "${YELLOW}IINA 插件系统需要 IINA 1.4.0 或更高版本。请运行以下命令升级：${NC}"
    echo -e "${BOLD}  brew install --cask iina${NC}"
    echo -e "或从官网下载最新版：${BLUE}https://iina.io${NC}\n"
  fi
else
  echo -e "\n${YELLOW}提示：未检测到 /Applications/IINA.app，请确保已安装 IINA 1.4.0+。${NC}"
fi

echo -e "\n${GREEN}${BOLD}✅ iina-emby 插件安装完成！${NC}"
echo -e "如果 IINA 正在运行，请重启 IINA 播放器生效。"
