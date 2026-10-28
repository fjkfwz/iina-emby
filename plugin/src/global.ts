/**
 * IINA Emby Plugin - Global Entry
 * Persistent background script that runs independently of player windows.
 * Manages the standalone browser window, listens for reopen requests, and coordinates playback.
 */

import { sanitizeStreamUrl } from "@shared";
import { createBrowserWindowManager } from "./lib/browser-window";
import { createDebugLogger } from "./lib/debug-log";
import { createEmbyApi } from "./lib/emby-api";
import { createSafeHttp } from "./lib/safe-http";
import { createServerSessionStore } from "./lib/server-session-store";
import { createBridgeDeps, type PlayMediaListMessage, type PlayMediaMessage } from "./lib/webview-bridge";

const { global, console, preferences, standaloneWindow, utils, http, menu, file } = iina;

const debugLog = createDebugLogger(preferences, console, file);

debugLog("Emby Plugin Global Entry loaded");
console.log("[iina-emby] Global Entry initialized");

const safeHttp = createSafeHttp(utils, debugLog);

// Shared API and Session Store
const { getClientIdentity } = createEmbyApi({
  http: safeHttp,
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
let latestPendingPlayData: PlayMediaMessage | null = null;
let latestPendingPlayListData: PlayMediaListMessage | null = null;

global.onMessage("player-active", (data?: { label?: string; url?: string }, player?: string | number) => {
  debugLog("Player reported active:", { data, player });
  if (player !== undefined && player !== null) {
    activePlayerTarget = player;
  }
  if (latestPendingPlayData && activePlayerTarget !== null) {
    debugLog("Sending pending play data to active player ID:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "apply-pending-media", latestPendingPlayData);
  }
});

global.onMessage("get-pending-media", (_data?: unknown, player?: string | number) => {
  debugLog("Player requested pending media:", player);
  const target = player !== undefined && player !== null ? player : activePlayerTarget;
  if (latestPendingPlayData && target !== null) {
    debugLog("Replying with pending play data to player ID:", target);
    global.postMessage(target, "apply-pending-media", latestPendingPlayData);
  }
  if (latestPendingPlayListData && target !== null) {
    debugLog("Replying with pending playlist data to player ID:", target);
    global.postMessage(target, "queue-pending-playlist", latestPendingPlayListData);
  }
});

global.onMessage("player-inactive", (data?: { label?: string }, player?: string | number) => {
  debugLog("Player reported inactive (retaining player instance for reuse):", { data, player });
});

global.onMessage("player-unregistered", (_data?: unknown, player?: string | number) => {
  debugLog("Player instance unregistered:", player);
  if (player !== undefined && player !== null) {
    if (activePlayerTarget === player) {
      activePlayerTarget = null;
    }
  } else {
    activePlayerTarget = null;
  }
});

global.onMessage("player-file-loaded", (data?: { itemId?: string; url?: string }, player?: string | number) => {
  debugLog("Player file loaded:", data);
  if (player !== undefined && player !== null) {
    activePlayerTarget = player;
  }
  const target = player !== undefined && player !== null ? player : activePlayerTarget;
  if (latestPendingPlayData && target !== null) {
    debugLog("Sending pending play data to player on file-loaded:", target);
    global.postMessage(target, "apply-pending-media", latestPendingPlayData);
  }
  if (latestPendingPlayListData && target !== null) {
    debugLog("Sending pending playlist data to player on file-loaded:", target);
    global.postMessage(target, "queue-pending-playlist", latestPendingPlayListData);
    latestPendingPlayListData = null;
  }
});

global.onMessage("player-next-queued", (data?: { count?: number; firstTitle?: string }) => {
  debugLog("Player queued upcoming episodes:", data);
});

global.onMessage("playback-progress-updated", (data?: unknown) => {
  if (standaloneWindow && typeof standaloneWindow.postMessage === "function") {
    standaloneWindow.postMessage("playback-progress-updated", data);
  }
});

function spawnNewPlayerInstance(playData: PlayMediaMessage): void {
  debugLog("Creating new player instance for playback:", playData.title);
  try {
    latestPendingPlayData = playData;
    const playerId = global.createPlayerInstance({
      url: playData.streamUrl,
      label: `emby-${Date.now()}`,
      enablePlugins: true,
      disableWindowAnimation: false,
    });
    debugLog(`Created player instance ${playerId} for: ${playData.title}`);
    if (playerId !== undefined && playerId !== null) {
      activePlayerTarget = playerId;
      global.postMessage(playerId, "apply-pending-media", playData);
      if (latestPendingPlayListData) {
        global.postMessage(playerId, "queue-pending-playlist", latestPendingPlayListData);
      }
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    debugLog.error("Failed to create player instance: " + errorMsg);
  }
}

/**
 * Handle media playback initiated from the standalone browser window
 */
function handleGlobalPlayMedia(data?: PlayMediaMessage, keepPendingPlaylist = false): void {
  if (!data?.streamUrl) return;

  if (!keepPendingPlaylist) {
    latestPendingPlayListData = null;
  }
  const streamUrl = sanitizeStreamUrl(data.streamUrl) || data.streamUrl;
  const playData = { ...data, streamUrl };
  latestPendingPlayData = playData;

  const openInNewWindow = preferences.get("open_in_new_window");
  debugLog("Global entry handleGlobalPlayMedia:", {
    title: playData.title,
    streamUrl: playData.streamUrl,
    startPositionTicks: playData.startPositionTicks,
    startPositionSeconds: playData.startPositionSeconds,
    selectedAudioIndex: playData.selectedAudioIndex,
    selectedSubtitleIndex: playData.selectedSubtitleIndex,
    audioTrackNumber: playData.audioTrackNumber,
    subtitleTrackNumber: playData.subtitleTrackNumber,
    activePlayerTarget,
    openInNewWindow,
  });

  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-command", playData);
    global.postMessage(activePlayerTarget, "apply-pending-media", playData);
  } else {
    spawnNewPlayerInstance(playData);
  }
}

function handleGlobalPlayMediaList(data?: PlayMediaListMessage): void {
  const items = data?.items || [];
  if (items.length === 0) return;

  const openInNewWindow = preferences.get("open_in_new_window");
  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media-list to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-list-command", data);
  } else {
    latestPendingPlayListData = data || null;
    const firstItem = items[0];
    handleGlobalPlayMedia(firstItem, true);
  }
}

const bridgeDeps = createBridgeDeps({
  preferences,
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

// Backward compatibility: create-player requests from player entries
global.onMessage("create-player", (data: PlayMediaMessage, player?: string | number) => {
  const streamUrl = String(data?.streamUrl || data?.url || "");
  const title = data?.title;
  debugLog("Global entry received create-player message", {
    hasData: Boolean(data),
    url: streamUrl,
    title,
  });

  try {
    if (!streamUrl) {
      throw new Error("No URL provided in create-player data");
    }

    const playData: PlayMediaMessage = { ...data, streamUrl };
    latestPendingPlayData = playData;

    const playerId = global.createPlayerInstance({
      url: streamUrl,
      label: `emby-${Date.now()}`,
      enablePlugins: true,
      disableWindowAnimation: false,
    });

    debugLog(`Created new player instance ${playerId} for: ${title}`);
    if (playerId !== undefined && playerId !== null) {
      activePlayerTarget = playerId;
      global.postMessage(playerId, "apply-pending-media", playData);
    }

    if (player !== undefined && player !== null) {
      global.postMessage(player, "player-created", {
        playerId,
        title,
        url: streamUrl,
      });
    }
  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugLog.error(`Error creating player instance: ${errorMsg}`);

    if (player !== undefined && player !== null) {
      global.postMessage(player, "player-creation-failed", {
        error: errorMsg,
        url: streamUrl,
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
