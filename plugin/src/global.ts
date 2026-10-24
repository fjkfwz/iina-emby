/**
 * IINA Emby Plugin - Global Entry
 * Persistent background script that runs independently of player windows.
 * Manages the standalone browser window, listens for reopen requests, and coordinates playback.
 */

import { createBrowserWindowManager } from "./lib/browser-window";
import { createDebugLogger } from "./lib/debug-log";
import { createEmbyApi } from "./lib/emby-api";
import { createServerSessionStore } from "./lib/server-session-store";
import { createBridgeDeps, type PlayMediaListMessage, type PlayMediaMessage } from "./lib/webview-bridge";

const { global, console, preferences, standaloneWindow, utils, http, menu, file } = iina;

const debugLog = createDebugLogger(preferences, console, file);

debugLog("Emby Plugin Global Entry loaded");
console.log("[iina-emby] Global Entry initialized");

// Shared API and Session Store
const { getClientIdentity } = createEmbyApi({
  http,
  preferences,
  log: debugLog,
});

const serverSessionStore = createServerSessionStore({
  preferences,
  standaloneWindow,
  log: debugLog,
});

// Track active player target (either number ID from createPlayerInstance or string label)
let activePlayerTarget: number | string | null = null;

global.onMessage("player-active", (data?: { label?: string; url?: string }, player?: string) => {
  debugLog("Player reported active:", { data, player });
  if (activePlayerTarget === null && player) {
    activePlayerTarget = player;
  }
});

global.onMessage("player-inactive", (data?: { label?: string }, player?: string) => {
  debugLog("Player reported inactive (retaining player instance for reuse):", { data, player });
});

global.onMessage("player-unregistered", (_data?: unknown, player?: string) => {
  debugLog("Player instance unregistered (retaining player instance for reuse):", player);
});

global.onMessage("player-file-loaded", (data?: { itemId?: string; url?: string }) => {
  debugLog("Player file loaded:", data);
});

global.onMessage("player-next-queued", (data?: { count?: number; firstTitle?: string }) => {
  debugLog("Player queued upcoming episodes:", data);
});

global.onMessage("playback-progress-updated", (data?: unknown) => {
  if (standaloneWindow && typeof standaloneWindow.postMessage === "function") {
    standaloneWindow.postMessage("playback-progress-updated", data);
  }
});

function spawnNewPlayerInstance(streamUrl: string, title?: string): void {
  debugLog("Creating new player instance for playback:", title);
  try {
    const playerId = global.createPlayerInstance({
      url: streamUrl,
      label: `emby-${Date.now()}`,
      enablePlugins: false,
      disableWindowAnimation: false,
    });
    debugLog(`Created player instance ${playerId} for: ${title}`);
    if (typeof playerId === "number") {
      activePlayerTarget = playerId;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    debugLog.error("Failed to create player instance: " + errorMsg);
  }
}

/**
 * Handle media playback initiated from the standalone browser window
 */
function handleGlobalPlayMedia(data?: PlayMediaMessage): void {
  if (!data?.streamUrl) return;

  const openInNewWindow = preferences.get("open_in_new_window");
  debugLog("Global entry handleGlobalPlayMedia:", {
    title: data.title,
    streamUrl: data.streamUrl,
    startPositionTicks: data.startPositionTicks,
    startPositionSeconds: data.startPositionSeconds,
    activePlayerTarget,
    openInNewWindow,
  });

  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-command", data);
  } else {
    spawnNewPlayerInstance(data.streamUrl, data.title);
  }
}

function handleGlobalPlayMediaList(data?: PlayMediaListMessage): void {
  const openInNewWindow = preferences.get("open_in_new_window");
  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media-list to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-list-command", data);
  } else {
    const firstItem = data?.items?.[0];
    if (firstItem) {
      handleGlobalPlayMedia(firstItem);
    }
  }
}

const bridgeDeps = createBridgeDeps({
  utils,
  log: debugLog,
  getClientIdentity,
  serverStore: serverSessionStore,
  onPlayMedia: handleGlobalPlayMedia,
  onPlayMediaList: handleGlobalPlayMediaList,
});

const { openEmbyStandaloneWindow, showEmbyBrowser } = createBrowserWindowManager({
  standaloneWindow,
  preferences,
  bridgeDeps,
  log: debugLog,
});

// Reopen standalone browser when requested by any player window closing or finishing playback
global.onMessage("reopen-browser", () => {
  console.log("[iina-emby] Global entry received reopen-browser request, opening standalone browser");
  debugLog("Global entry opening standalone Emby browser");
  openEmbyStandaloneWindow();
});

// Global menu item so users can open the Emby browser even when 0 player windows exist
menu.addItem(
  menu.item("Show Emby Browser", showEmbyBrowser, {
    keyBinding: "Meta+Shift+e",
  }),
);

interface CreatePlayerData {
  url?: string;
  title?: string;
}

// Backward compatibility: create-player requests from player entries
global.onMessage("create-player", (data: CreatePlayerData, player?: string) => {
  debugLog("Global entry received create-player message", {
    hasData: Boolean(data),
    url: data?.url,
    title: data?.title,
  });

  try {
    const { url, title } = data;
    if (!url) {
      throw new Error("No URL provided in create-player data");
    }

    const playerId = global.createPlayerInstance({
      url,
      label: `emby-${Date.now()}`,
      enablePlugins: false,
      disableWindowAnimation: false,
    });

    debugLog(`Created new player instance ${playerId} for: ${title}`);
    if (typeof playerId === "number") {
      activePlayerTarget = playerId;
    }

    if (player !== undefined) {
      global.postMessage(player, "player-created", {
        playerId,
        title,
        url,
      });
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugLog.error(`Error creating player instance: ${errorMsg}`);

    if (player !== undefined) {
      global.postMessage(player, "player-creation-failed", {
        error: errorMsg,
        url: data?.url,
      });
    }
  }
});

debugLog("Global entry message listeners registered");

// Auto-open Emby Browser on IINA launch
try {
  const shouldAutoOpen = preferences.get("auto_open_on_launch") !== false;
  if (shouldAutoOpen) {
    debugLog("Auto-opening Emby standalone browser on IINA launch");
    setTimeout(() => {
      try {
        openEmbyStandaloneWindow();
      } catch (err: unknown) {
        console.error(`[iina-emby] Error auto-opening standalone window: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 500);
  }
} catch (e: unknown) {
  debugLog(`Error in auto_open_on_launch: ${e instanceof Error ? e.message : String(e)}`);
}
