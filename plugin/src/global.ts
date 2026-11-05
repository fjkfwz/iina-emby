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

const safeHttp = createSafeHttp(utils, debugLog, http);

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
let activePlayerLabel: string | null = null;
let latestPendingPlayData: PlayMediaMessage | null = null;
let latestPendingPlayListData: PlayMediaListMessage | null = null;

function clearActivePlayer(): void {
  debugLog("Clearing active player state:", { activePlayerTarget, activePlayerLabel });
  activePlayerTarget = null;
  activePlayerLabel = null;
}

function extractPlayerTarget(candidate?: string | number | null, label?: string): number | string | null {
  if (candidate === null || candidate === undefined) {
    return label || null;
  }
  if (typeof candidate === "number") {
    return candidate;
  }
  const str = String(candidate).trim();
  const parsed = Number.parseInt(str, 10);
  if (!Number.isNaN(parsed)) {
    return parsed;
  }
  if (label) {
    return label;
  }
  return str.length > 0 ? str : null;
}

function postToPlayer(target: number | string | null, name: string, data?: unknown): void {
  const norm = extractPlayerTarget(target);
  if (typeof norm === "number") {
    global.postMessage(norm, name, data);
    return;
  }
  if (typeof norm === "string") {
    global.postMessage(norm, name, data);
    return;
  }
  global.postMessage(null, name, data);
}

function isMatchingPlayer(target: number | string | null, candidate?: string | number): boolean {
  if (target === null || target === undefined) return false;
  if (candidate === undefined || candidate === null) return false;
  if (target === candidate) return true;
  const numTarget = typeof target === "number" ? target : Number.parseInt(String(target), 10);
  const numCandidate = typeof candidate === "number" ? candidate : Number.parseInt(String(candidate), 10);
  if (!Number.isNaN(numTarget) && !Number.isNaN(numCandidate) && numTarget === numCandidate) {
    return true;
  }
  const sTarget = String(target);
  const sCand = String(candidate);
  return sTarget === sCand || sCand.startsWith(sTarget) || sTarget.startsWith(sCand);
}

function handlePlayerDeactivated(dataLabel?: string, player?: string | number): void {
  if (!activePlayerTarget && !activePlayerLabel) return;
  const matchesTarget = player !== undefined && player !== null && isMatchingPlayer(activePlayerTarget, player);
  const matchesLabel = Boolean(
    dataLabel && (dataLabel === activePlayerLabel || isMatchingPlayer(activePlayerTarget, dataLabel)),
  );
  const isEmbyPlayer = Boolean(dataLabel && dataLabel.startsWith("emby-"));

  if (matchesTarget || matchesLabel || isEmbyPlayer) {
    debugLog("Clearing active player because player deactivated:", {
      activePlayerTarget,
      activePlayerLabel,
      player,
      dataLabel,
    });
    clearActivePlayer();
  } else {
    debugLog("Ignoring deactivation from non-active or unknown player:", {
      activePlayerTarget,
      activePlayerLabel,
      player,
      dataLabel,
    });
  }
}

global.onMessage("player-active", (data?: { label?: string; url?: string }, player?: string | number) => {
  debugLog("Player reported active:", { data, player });
  // Ignore player-active from the welcome/initial window (player 0) unless it has an Emby label or Emby URL
  const isEmby = Boolean((data?.label && data.label.startsWith("emby-")) || data?.url);
  if (!isEmby && (player === 0 || player === "0")) {
    debugLog("Ignoring player-active from welcome/initial window 0");
    return;
  }
  const target = extractPlayerTarget(player, data?.label);
  if (target !== null) {
    activePlayerTarget = target;
  }
  if (data?.label) {
    activePlayerLabel = data.label;
  }
  if (latestPendingPlayData && activePlayerTarget !== null) {
    debugLog("Sending pending play data to active player ID:", activePlayerTarget);
    postToPlayer(activePlayerTarget, "apply-pending-media", latestPendingPlayData);
  }
});

global.onMessage("get-pending-media", (data?: { label?: string }, player?: string | number) => {
  debugLog("Player requested pending media:", { data, player });
  const target = extractPlayerTarget(player, data?.label) ?? activePlayerTarget;
  if (latestPendingPlayData && target !== null) {
    debugLog("Replying with pending play data to player ID:", target);
    postToPlayer(target, "apply-pending-media", latestPendingPlayData);
  }
  if (latestPendingPlayListData && target !== null) {
    debugLog("Replying with pending playlist data to player ID:", target);
    postToPlayer(target, "queue-pending-playlist", latestPendingPlayListData);
  }
});

global.onMessage("player-inactive", (data?: { label?: string }, player?: string | number) => {
  debugLog("Player reported inactive:", { data, player });
  handlePlayerDeactivated(data?.label, player);
});

global.onMessage("player-closed", (data?: { label?: string } | unknown, player?: string | number) => {
  debugLog("Player reported closed:", { data, player });
  const dataLabel =
    typeof data === "object" && data !== null && "label" in data ? (data as { label?: string }).label : undefined;
  handlePlayerDeactivated(dataLabel, player);
});

global.onMessage("player-unregistered", (data?: { label?: string } | unknown, player?: string | number) => {
  debugLog("Player instance unregistered:", { data, player });
  const dataLabel =
    typeof data === "object" && data !== null && "label" in data ? (data as { label?: string }).label : undefined;
  handlePlayerDeactivated(dataLabel, player);
});

global.onMessage("player-file-loaded", (data?: { itemId?: string; url?: string; label?: string }, player?: string | number) => {
  debugLog("Player file loaded:", data);
  const target = extractPlayerTarget(player, data?.label);
  if (target !== null) {
    activePlayerTarget = target;
  }
  if (data?.label) {
    activePlayerLabel = data.label;
  }
  const targetForMsg = target !== null ? target : activePlayerTarget;
  if (latestPendingPlayData && targetForMsg !== null) {
    debugLog("Sending pending play data to player on file-loaded:", targetForMsg);
    postToPlayer(targetForMsg, "apply-pending-media", latestPendingPlayData);
  }
  if (latestPendingPlayListData && targetForMsg !== null) {
    debugLog("Sending pending playlist data to player on file-loaded:", targetForMsg);
    postToPlayer(targetForMsg, "queue-pending-playlist", latestPendingPlayListData);
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
  if (typeof data === "object" && data !== null && (data as any).event === "stop") {
    debugLog("Playback reported stopped, clearing active player");
    clearActivePlayer();
  }
});

function spawnNewPlayerInstance(playData: PlayMediaMessage): void {
  debugLog("Creating new player instance for playback:", playData.title);
  try {
    latestPendingPlayData = playData;
    const label = `emby-${Date.now()}`;
    const playerId = global.createPlayerInstance({
      url: playData.streamUrl,
      label,
      enablePlugins: true,
      disableWindowAnimation: true,
    });
    debugLog(`Created player instance ${playerId} (label=${label}) for: ${playData.title}`);
    activePlayerLabel = label;
    if (playerId !== undefined && playerId !== null) {
      activePlayerTarget = typeof playerId === "number" ? playerId : Number.parseInt(String(playerId), 10) || label;
      postToPlayer(activePlayerTarget, "play-media-command", playData);
      postToPlayer(activePlayerTarget, "apply-pending-media", playData);
      if (latestPendingPlayListData) {
        postToPlayer(activePlayerTarget, "queue-pending-playlist", latestPendingPlayListData);
      }
    } else {
      activePlayerTarget = label;
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    debugLog.error("Failed to create player instance: " + errorMsg);
    clearActivePlayer();
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
    postToPlayer(activePlayerTarget, "play-media-command", playData);
    postToPlayer(activePlayerTarget, "apply-pending-media", playData);
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
    postToPlayer(activePlayerTarget, "play-media-list-command", data);
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
  debugLog("Global entry opening standalone Emby browser and clearing active player");
  clearActivePlayer();
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

    const label = `emby-${Date.now()}`;
    const playerId = global.createPlayerInstance({
      url: streamUrl,
      label,
      enablePlugins: true,
      disableWindowAnimation: true,
    });

    debugLog(`Created new player instance ${playerId} (label=${label}) for: ${title}`);
    activePlayerLabel = label;
    if (playerId !== undefined && playerId !== null) {
      activePlayerTarget = typeof playerId === "number" ? playerId : Number.parseInt(String(playerId), 10) || label;
      postToPlayer(activePlayerTarget, "play-media-command", playData);
      postToPlayer(activePlayerTarget, "apply-pending-media", playData);
    } else {
      activePlayerTarget = label;
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
        title,
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
