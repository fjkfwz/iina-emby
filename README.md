# iina-emby

<div align="center">

**Modern, fast, and feature-rich Emby client plugin for [IINA](https://iina.io).**

[English](README.md) • [简体中文](README_CN.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-macOS-lightgrey.svg)](https://apple.com/macos)
[![IINA Compatibility](https://img.shields.io/badge/IINA-%3E%3D%201.4.0-brightgreen.svg)](https://iina.io)
[![Latest Release](https://img.shields.io/github/v/release/fjkfwz/iina-emby?color=orange)](https://github.com/fjkfwz/iina-emby/releases)

<br/>

<img src="docs/home.webp" alt="IINA Emby Home Browser" width="880" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.35); margin-bottom: 16px;" />

<img src="docs/detail.webp" alt="IINA Emby Media Detail View" width="880" style="border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.35);" />

</div>

---

## ✨ Features

- **Modern macOS Media Browser**: Standalone browsing interface designed to look and feel native to macOS with dark frosted-glass aesthetics.
- **Smooth Scroll-Driven Header**: Dynamic top navigation bar with continuous frosted-glass and gradient shadow interpolation that smoothly fades in on scroll.
- **Featured Hero Carousel & Shelves**: Automatically cycles top featured media banners and quick-access 16:9 category shelves.
- **Native Hardware-Accelerated Playback**: Launches IINA player windows using MPV with direct stream playback and hardware decoding.
- **Resume Progress & Interactive Glass Feedback**: Item details page displays visual progress track and readable timestamp directly on the play button (e.g. `继续播放 (00:50:20 · 40%)`) with responsive hover and active states.
- **Crash-Free Playback Architecture**: Progress reporting (`Playing`, `Progress`, `Stopped`) is bridged safely through WebKit networking, completely avoiding JavaScriptCore thread blocking.
- **Subtitle & Audio Stream Selector**: Intuitive track switching with stream index mapping, language code matching, and local download of external subtitles.
- **Real-Time WebSocket Sync**: Instant updates for continue watching and library item changes via Emby WebSocket connection.
- **Multi-Server Management**: Easily add, switch, and manage multiple Emby server profiles and user tokens.
- **Universal Compatibility**: Full support for macOS Catalina 10.15.7 (Safari 13) through macOS Sonoma/Sequoia with built-in WebP decoding and IndexedDB caching.

---

## 📦 Installation

### Option 1: AI Agent One-Click Install (Recommended)

If you are using an AI coding assistant (such as **Antigravity**, **Claude Code**, or **Cursor**), simply paste this instruction into the chat:

```text
Please install the latest iina-emby plugin into my local IINA player:
Directly download the latest `.iinaplgz` package from https://github.com/fjkfwz/iina-emby/releases/latest, install it into my local IINA player, and restart IINA to activate it.
```

The agent will download the pre-built release package, extract it directly into your IINA plugins folder with zero build dependencies, and restart IINA.

---

### Option 2: Download Release Package (.iinaplgz)

Download the latest pre-built plugin package (`com.ghotriw.iina-emby-*.iinaplgz`) from [GitHub Releases](https://github.com/fjkfwz/iina-emby/releases/latest).

Double-click the downloaded `.iinaplgz` file or drag it directly into the IINA window to install.

---

### Option 3: One-Line Terminal Command

Run the following command in Terminal to clone, build, and install the latest version:

```bash
git clone https://github.com/fjkfwz/iina-emby.git /tmp/iina-emby && cd /tmp/iina-emby && ./scripts/install.sh
```

---

### Option 4: Install from Local Repository

If you have already cloned this repository, run:

```bash
pnpm install
pnpm run build
pnpm run install:plugin
```

> **Note**: This plugin requires **IINA >= 1.4.0**. If you have an older version, update via Homebrew:
> ```bash
> brew install --cask iina
> ```

---

### Option 5: Install via IINA GUI

1. Open **IINA Preferences** (`⌘,`) -> **Plugins**.
2. Click **Install from GitHub / URL**.
3. Enter `fjkfwz/iina-emby` and click **Install**.

---

## 🖼 Screenshots & UI Showcase

| Home View (Hero Carousel & Quick Categories) |
| :---: |
| <img src="docs/home.webp" width="100%" alt="Home View" /> |

| Media Detail View (Streams, Audio/Subtitle Badges & Specs) |
| :---: |
| <img src="docs/detail.webp" width="100%" alt="Media Detail View" /> |

| Media Shelf Browser (Posters Waterfall & Library Shelves) |
| :---: |
| <img src="docs/shelf.webp" width="100%" alt="Media Shelf Browser" /> |

---

## 🛠 Tech Stack & Architecture

- **Frontend Browser**: React 19, TypeScript, React Router, TanStack Query, Vite with single-file bundling.
- **IINA Plugin Engine**: TypeScript bundled via `tsup`, communicating with IINA's MPV core and JavaScript plugin runtime.
- **Bidirectional Bridge**: High-performance typed IPC bridge between the standalone WebKit window and IINA player instances.

---

## 💻 Development

```bash
# Install dependencies
pnpm install

# Run unit tests
pnpm test

# Build production bundle
pnpm run build

# Watch plugin code during development
pnpm run dev:plugin

# Run UI dev server in standard web browser
pnpm run dev

# Run TypeScript typecheck
pnpm run typecheck
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
