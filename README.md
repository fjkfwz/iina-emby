# iina-emby

Emby plugin for [IINA](https://iina.io). Provides a media browser interface and playback integration with Emby servers.

![IINA Emby Browser](docs/screenshot.webp)

## Features

- Standalone media browser (Continue Watching, Libraries, TV Shows, Movies)
- Direct playback in IINA player windows
- Progress reporting and playback resume sync with Emby server
- Next episode autoplay
- Subtitle downloading from Emby
- Multi-server support

## Installation

### Agent / 命令行一键安装 (推荐)

如果你正在使用 AI Agent（如 Antigravity, Claude Code, Cursor 等）或通过终端安装，可直接使用以下方式一键构建并安装至本机 IINA：

#### 1. 直接发送给 Agent 的提示词
```text
请帮我将 iina-emby 插件安装到本机的 IINA 播放器中：克隆 https://github.com/fjkfwz/iina-emby.git，安装依赖并构建，然后将产物安装至 ~/Library/Application Support/com.colliderli.iina/plugins/com.ghotriw.iina-emby.iinaplugin。
```

#### 2. 终端单行命令一键安装
```bash
git clone https://github.com/fjkfwz/iina-emby.git /tmp/iina-emby && cd /tmp/iina-emby && ./scripts/install.sh
```

#### 3. 已有代码仓库安装
在已克隆的代码仓库根目录下执行：
```bash
pnpm install
pnpm run build
pnpm run install:plugin
```

> **注意**：IINA 插件功能要求 **IINA >= 1.4.0**。若本机版本较低，可使用 Homebrew 快速升级：
> ```bash
> brew install --cask iina
> ```

### From IINA (UI)

1. Open **IINA Preferences** (`⌘,`) -> **Plugins**.
2. Click **Install from GitHub / URL**.
3. Enter `fjkfwz/iina-emby` and click **Install**.

### Manual

Download the `.iinaplgz` package from [Releases](https://github.com/fjkfwz/iina-emby/releases) and open it with IINA.

## Development

```bash
pnpm install
pnpm run build

# Watch plugin scripts
pnpm run dev:plugin

# Run UI in browser
pnpm run dev

# Type check
pnpm run typecheck
```

## License

MIT
