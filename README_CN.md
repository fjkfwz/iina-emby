# iina-emby

<div align="center">

**专为 [IINA](https://iina.io) 打造的现代化、高性能 Emby 媒体库客户端插件。**

[English](README.md) • [简体中文](README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](https://apple.com/macos)
[![IINA Compatibility](https://img.shields.io/badge/IINA-%3E%3D%201.4.0-brightgreen.svg)](https://iina.io)
[![Latest Release](https://img.shields.io/github/v/release/fjkfwz/iina-emby?color=orange)](https://github.com/fjkfwz/iina-emby/releases)

<br/>

<img src="docs/home.webp" alt="IINA Emby 媒体浏览器首页" width="880" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.35); margin-bottom: 16px;" />

<img src="docs/detail.webp" alt="IINA Emby 媒体详情页" width="880" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.35);" />

</div>

---

## ✨ 功能特性

- **原生 macOS 质感媒体浏览器**：采用 React 19 构建，深度契合 macOS 深色半透明磨砂玻璃设计语言。
- **平滑滚动驱动渐变顶栏**：顶部导航栏伴随页面滚动持续插值平滑淡入磨砂玻璃模糊层与深色渐变保护阴影，告别生硬突变。
- **精选轮播海报与分类横轴**：首页自动轮播精选剧集/电影海报横幅，并在首行提供紧凑的 16:9 分类媒体库横轴。
- **MPV 原生硬件加速播放**：直接拉起 IINA 独立播放器窗口，享受 MPV 原生 DirectPlay 流播放与硬件解码。
- **播放按钮进度条与交互反馈**：详情页播放按钮底部常驻高亮续播进度条，标注播放位置与百分比（例如：`继续播放 (00:50:20 · 40%)`），平时保持通透玻璃质感，悬浮时智能提亮并带高光边缘。
- **零阻塞防闪退架构**：播放会话报告（`Playing`、`Progress`、`Stopped`）安全交由 WebKit 原生网络沙箱回传，彻底消除 IINA 内部 JavaScriptCore 线程阻塞与闪退。
- **音轨与字幕智能切换**：支持媒体流索引映射、语言代码模糊匹配、外挂字幕本地安全下载与内置字幕直接切换。
- **WebSocket 实时双向同步**：通过 Emby WebSocket 实时推送库变更与观影状态，无需手动刷新。
- **多服务器快速切换**：支持保存多个 Emby 服务器连接与账号信息，一键快速无缝切换。
- **全平台兼容与极端优化**：全面兼容 Safari 13+ / macOS Catalina (10.15.7) 老系统，内置 WebP 软解与 IndexedDB 持久化缓存。

---

## 📦 安装指南

### 方式 1：AI Agent 一键安装（推荐）

如果你正在使用 AI 编程助手（如 **Antigravity**、**Claude Code** 或 **Cursor**），只需将以下提示词发送给 Agent：

```text
请帮我将 iina-emby 插件安装到本机的 IINA 播放器中：
直接从 https://github.com/fjkfwz/iina-emby/releases/latest 下载最新的 .iinaplgz 插件包，解压安装到本地 IINA 插件目录（~/Library/Application Support/com.colliderli.iina/plugins/com.ghotriw.iina-emby.iinaplugin/），并重启 IINA 播放器生效。
```

Agent 会自动从 Release 下载已编译好的安装包并一键解压部署，无需安装 Node.js、pnpm 或配置任何前端构建环境。

---

### 方式 2：下载已打包插件文件 (.iinaplgz)

从 [GitHub Releases](https://github.com/fjkfwz/iina-emby/releases/latest) 下载最新发布的 `com.ghotriw.iina-emby-*.iinaplgz` 安装包。

双击下载的 `.iinaplgz` 文件，或直接将其拖入 IINA 窗口中即可完成安装/升级。

---

### 方式 3：终端单行命令一键安装

在终端中执行以下命令，自动拉取、构建并安装最新版本：

```bash
git clone https://github.com/fjkfwz/iina-emby.git /tmp/iina-emby && cd /tmp/iina-emby && ./scripts/install.sh
```

---

### 方式 4：从已克隆的本地工程安装

如果你已经克隆了本项目仓库，直接运行：

```bash
pnpm install
pnpm run build
pnpm run install:plugin
```

> **注意**：IINA 插件功能要求 **IINA >= 1.4.0**。若本机版本较低，可使用 Homebrew 快速升级：
> ```bash
> brew install --cask iina
> ```

---

### 方式 5：通过 IINA 图形界面安装

1. 打开 **IINA 设置** (`⌘,`) -> **插件 (Plugins)**。
2. 点击 **从 GitHub / URL 安装 (Install from GitHub / URL)**。
3. 输入 `fjkfwz/iina-emby` 并点击 **安装 (Install)**。

---

## 🖼 界面预览

| 首页精选轮播与分类快捷导航 |
| :---: |
| <img src="docs/home.webp" width="100%" alt="首页精选与分类导航" /> |

| 影片详情页（播放进度条、音轨/字幕胶囊与媒体规格） |
| :---: |
| <img src="docs/detail.webp" width="100%" alt="媒体详情页" /> |

| 媒体库瀑布流与继续播放 |
| :---: |
| <img src="docs/screenshot.webp" width="100%" alt="媒体库海报横轴" /> |

---

## 🛠 技术架构

- **前端媒体浏览器**：React 19、TypeScript、React Router、TanStack Query，由 Vite 进行单文件生产打包（Inline HTML）。
- **IINA 插件后端**：基于 `tsup` 打包的双入口架构（独立播放器 entry + 全局后台 globalEntry），与 IINA 的 MPV 原生核心紧密协作。
- **双向类型安全 Bridge**：WebKit 渲染进程与 IINA Swift/JSC 宿主进程间的高性能 IPC 通信体系。

---

## 💻 本地开发

```bash
# 安装依赖
pnpm install

# 运行自动化单元测试
pnpm test

# 生产环境打包构建
pnpm run build

# 监听开发插件代码
pnpm run dev:plugin

# 在浏览器中预览前端界面
pnpm run dev

# 执行 TypeScript 类型检查
pnpm run typecheck
```

---

## 📄 开源许可

本项目遵循 [MIT License](LICENSE) 开源协议。
