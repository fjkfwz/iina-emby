/**
 * IINA Emby Plugin
 */

import { isSameEmbyHost } from "@shared";
import { createAutoplayManager } from "./lib/autoplay-manager";
import { createDebugLogger } from "./lib/debug-log";
import { createEmbyApi } from "./lib/emby-api";
import { createMediaActionsManager } from "./lib/media-actions";
import { createPlaybackCoordinator } from "./lib/playback-coordinator";
import { createPlaybackTrackingManager } from "./lib/playback-tracking";
import { createServerSessionStore } from "./lib/server-session-store";
import type { PlayMediaListMessage, PlayMediaMessage } from "./lib/webview-bridge";

const { core, console: iinaConsole, menu, event, http, utils, preferences, mpv, global: iinaGlobal, file } = iina;

const debugLog = createDebugLogger(preferences, iinaConsole, file);

const { buildEmbyHeaders, parseEmbyUrl, isEmbyUrl, fetchPlaybackInfo, fetchItemMetadata, secondsToTicks, ticksToSeconds } = createEmbyApi({
  http,
  preferences,
  log: debugLog,
});

const serverSessionStore = createServerSessionStore({
  preferences,
  log: debugLog,
});

const { storeEmbySession, getStoredEmbySession } = serverSessionStore;

debugLog("Emby Plugin loaded");

const { startPlaybackTracking, stopPlaybackTracking, handlePauseChange, getCurrentPlaybackSession } = createPlaybackTrackingManager({
  core,
  http,
  preferences,
  buildEmbyHeaders,
  fetchPlaybackInfo,
  fetchItemMetadata,
  secondsToTicks,
  ticksToSeconds,
  onProgressUpdated: (data) => {
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("playback-progress-updated", data);
    }
  },
  log: debugLog,
});

let isWindowClosing = false;

const { setupAutoplayForEpisode, resetForNewFile, clearQueuedFlag, isQueued } = createAutoplayManager({
  http,
  mpv,
  core,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  isClosing: () => isWindowClosing,
  buildEmbyHeaders,
  fetchItemMetadata,
  log: debugLog,
});

const { setVideoTitleFromMetadata, downloadAllSubtitles, manualDownloadSubtitles, manualSetTitle, updateFromFileUrl } =
  createMediaActionsManager({
    core,
    http,
    utils,
    preferences,
    mpv,
    parseEmbyUrl,
    isEmbyUrl,
    fetchPlaybackInfo,
    fetchItemMetadata,
    getActiveSession: getStoredEmbySession,
    log: debugLog,
  });

const {
  handlePlayMedia,
  handlePlayMediaList,
  flushPendingPlaylistQueue,
  consumeReplacementGuard,
  markLaunchedFromBrowser,
  clearLaunchedFromBrowser,
  consumeLaunchedFromBrowser,
  getPendingMediaTitle,
  getPendingStartPosition,
  getPendingAudioIndex,
  getPendingSubtitleIndex,
} = createPlaybackCoordinator({
  core,
  mpv,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  getCurrentPlaybackSession,
  clearQueuedFlag,
  log: debugLog,
});

// Check if this player window was spawned specifically for Emby playback
if (iinaGlobal && typeof iinaGlobal.getLabel === "function") {
  const label = iinaGlobal.getLabel();
  if (label?.startsWith("emby-")) {
    debugLog(`Player instance opened with label ${label}, marking as browser playback`);
    markLaunchedFromBrowser();
  }
}

// Listen for playback commands forwarded from global standalone window
if (iinaGlobal && typeof iinaGlobal.onMessage === "function") {
  iinaGlobal.onMessage("play-media-command", (data?: PlayMediaMessage) => {
    debugLog("Received play-media-command from global entry", data);
    isWindowClosing = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMedia(data);
  });
  iinaGlobal.onMessage("play-media-list-command", (data?: PlayMediaListMessage) => {
    debugLog("Received play-media-list-command from global entry", data);
    isWindowClosing = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMediaList(data);
  });
}

let currentLoadedFileUrl: string | null = null;

function getEffectiveFileUrl(fileUrl?: string): string | undefined {
  if (fileUrl && typeof fileUrl === "string") {
    return fileUrl;
  }
  try {
    if (core.status?.url) {
      return core.status.url;
    }
  } catch {
    // Ignore
  }
  try {
    const mpvPath = mpv.getString("path");
    if (mpvPath) {
      return mpvPath;
    }
  } catch {
    // Ignore
  }
  return undefined;
}

/**
 * Handle file loaded event
 */
function onFileLoaded(fileUrl?: string): void {
  isWindowClosing = false;

  const resolvedUrl = getEffectiveFileUrl(fileUrl);
  debugLog(`File loaded event: raw=${fileUrl}, resolved=${resolvedUrl}`);

  if (!resolvedUrl) {
    debugLog("No resolved URL found on file loaded");
    return;
  }

  if (currentLoadedFileUrl === resolvedUrl) {
    debugLog(`File ${resolvedUrl} already initialized, skipping duplicate file-loaded event`);
    return;
  }
  currentLoadedFileUrl = resolvedUrl;

  // The first item of a queued list is playing now, so the rest can be added
  flushPendingPlaylistQueue(resolvedUrl);

  // Stop any existing playback tracking from previous file
  stopPlaybackTracking();

  const embyInfo = updateFromFileUrl(resolvedUrl);
  if (!embyInfo) {
    clearLaunchedFromBrowser();
  } else {
    // Decide which credentials playback reporting (progress/resume/watched)
    // should use. By default it's the api_key embedded in the playing URL, so
    // it records into whoever owns that key. When "use_connected_account" is on
    // and a server is logged in via the Emby browser sidebar, report to
    // that account instead — the item id still comes from the URL, only the
    // server + token change. This lets several people open the SAME shared link
    // (e.g. over Syncplay) while each records progress into their own account.
    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;
    let reportUserId: string | undefined;

    const session = getStoredEmbySession();
    if (session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
      reportUserId = session.userId;
      if (preferences.get("use_connected_account")) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        debugLog(
          `Connected-account mode: reporting as ${session.username || session.serverName} @ ${reportServerBase} (ignoring URL api_key)`,
        );
      }
    } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
      reportUserId = session.userId;
    } else if (preferences.get("auto_login_enabled")) {
      // Default behaviour: remember this URL's session for auto-login.
      storeEmbySession(embyInfo.serverBase, embyInfo.apiKey);
    } else {
      debugLog("Auto-login from Emby URLs disabled, not storing the URL credentials");
    }

    // Reset mpv start property once file has loaded
    try {
      mpv.set("start", "none");
    } catch {
      // Ignore
    }

    // Start playback tracking for progress sync
    if (preferences.get("sync_playback_progress")) {
      const pendingStart = getPendingStartPosition(embyInfo.itemId);
      debugLog(
        `Starting playback tracking for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}, pendingStart: ${pendingStart ?? "none"}`,
      );
      startPlaybackTracking(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId, pendingStart);
    }

    // Set video title from metadata if enabled
    if (preferences.get("set_video_title")) {
      const knownTitle = getPendingMediaTitle(embyInfo.itemId);
      if (knownTitle) {
        try {
          mpv.set("force-media-title", knownTitle);
          debugLog(`Pre-set video title from known playback title: ${knownTitle}`);
        } catch {
          // Ignore
        }
      }
      debugLog(`Setting video title from metadata for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
      setVideoTitleFromMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }

    // Setup autoplay for TV episodes if enabled
    if (preferences.get("autoplay_next_episode")) {
      debugLog(`Setting up autoplay for episode (itemId): ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
      resetForNewFile();
      setupAutoplayForEpisode(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }

    // Apply user-selected audio track and subtitle track if specified from detail page
    const pendingAudio = getPendingAudioIndex(embyInfo.itemId);
    const pendingSubtitle = getPendingSubtitleIndex(embyInfo.itemId);

    if (typeof pendingAudio === "number") {
      try {
        debugLog(`Applying user-selected audio track index: ${pendingAudio}`);
        const trackList = mpv.getNative<Array<{ id: number; type: string; "src-id"?: number }>>("track-list");
        if (Array.isArray(trackList)) {
          const audioTracks = trackList.filter((t) => t.type === "audio");
          const match = audioTracks.find((t) => t["src-id"] === pendingAudio || t.id === pendingAudio);
          if (match && typeof match.id === "number") {
            debugLog(`Matched mpv audio track id: ${match.id}`);
            mpv.set("aid", match.id);
          } else if (pendingAudio > 0 && pendingAudio <= audioTracks.length) {
            mpv.set("aid", pendingAudio);
          }
        } else {
          mpv.set("aid", pendingAudio);
        }
      } catch (err) {
        debugLog("Failed to set audio track:", err);
      }
    }

    if (typeof pendingSubtitle === "number") {
      try {
        if (pendingSubtitle === -1) {
          debugLog("User selected to turn off subtitles");
          mpv.set("sid", "no");
          try {
            core.subtitle.id = null;
          } catch {
            // Ignore
          }
        } else {
          debugLog(`Applying user-selected subtitle track index: ${pendingSubtitle}`);
          const trackList = mpv.getNative<Array<{ id: number; type: string; "src-id"?: number }>>("track-list");
          if (Array.isArray(trackList)) {
            const subTracks = trackList.filter((t) => t.type === "sub");
            const match = subTracks.find((t) => t["src-id"] === pendingSubtitle || t.id === pendingSubtitle);
            if (match && typeof match.id === "number") {
              debugLog(`Matched mpv subtitle track id: ${match.id}`);
              mpv.set("sid", match.id);
            } else if (pendingSubtitle > 0 && pendingSubtitle <= subTracks.length) {
              mpv.set("sid", pendingSubtitle);
            }
          } else {
            mpv.set("sid", pendingSubtitle);
          }
        }
      } catch (err) {
        debugLog("Failed to set subtitle track:", err);
      }
    }

    // Only auto-download if enabled
    if (preferences.get("auto_download_enabled")) {
      debugLog(`Auto-downloading subtitles for: ${embyInfo.itemId}`);
      downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey);
      if (pendingSubtitle === -1) {
        // Guarantee subtitles remain off even if external subtitles were loaded
        try {
          mpv.set("sid", "no");
          core.subtitle.id = null;
        } catch {
          // Ignore
        }
      }
    } else {
      debugLog("Auto download disabled, but Emby URL stored for manual download");
    }

    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("player-file-loaded", {
        itemId: embyInfo.itemId,
        url: resolvedUrl,
      });
      iinaGlobal.postMessage("player-active", {
        itemId: embyInfo.itemId,
        url: resolvedUrl,
      });
    }
  }
}

/**
 * Automatically reopen the standalone content browser if media that originated
 * from the browser has finished or its window was closed by the user.
 */
function handlePlaybackTermination(reason: "end-file" | "window-close"): void {
  const shouldReopen = preferences.get("reopen_browser_on_playback_end") !== false;
  if (shouldReopen && consumeLaunchedFromBrowser()) {
    console.log(`[iina-emby] Playback terminated (${reason}), requesting global reopen`);
    debugLog(`Playback terminated (${reason}) for media launched from browser, requesting global reopen`);
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("reopen-browser", {});
    }
  }
}

// Menu items (Show Emby Browser is registered in globalEntry so it is always available without duplicates)
menu.addItem(menu.item("Download Emby Subtitles", manualDownloadSubtitles));
menu.addItem(menu.item("Set Emby Title", manualSetTitle));

// Event handlers
event.on("iina.file-loaded", onFileLoaded);

event.on("iina.file-started", () => {
  isWindowClosing = false;
  onFileLoaded();
});

event.on("mpv.file-loaded", () => {
  isWindowClosing = false;
  onFileLoaded();
});

event.on("mpv.path.changed", (newPath: unknown) => {
  if (typeof newPath === "string" && newPath.trim().length > 0) {
    isWindowClosing = false;
    onFileLoaded(newPath);
  }
});

event.on("iina.window-loaded", () => {
  debugLog("Window loaded event received");
  isWindowClosing = false;
});

event.on("mpv.playlist-pos.changed", () => {
  if (isWindowClosing) return;
  onFileLoaded();
});

event.on("mpv.pause.changed", () => {
  if (isWindowClosing) return;
  handlePauseChange();
});

// Handle file ending (includes both natural end and replacement)
event.on("mpv.end-file", () => {
  if (isWindowClosing) {
    debugLog("Window is closing, skipping mpv.end-file handler");
    return;
  }

  const queuedForAutoplay = isQueued();
  const isReplacingPlayback = consumeReplacementGuard();
  let hasMoreInPlaylist = false;
  try {
    const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
    const currentPos = Number(mpv.getNumber("playlist-pos") || 0);
    hasMoreInPlaylist = playlistCount > 0 && currentPos < playlistCount - 1;
  } catch {
    // Player may already be tearing down mpv core
  }

  debugLog(
    `mpv.end-file triggered, isReplacingPlayback=${isReplacingPlayback}, autoplayQueued=${queuedForAutoplay}, hasMoreInPlaylist=${hasMoreInPlaylist}`,
  );
  if (isReplacingPlayback) {
    debugLog("File replacement in progress, skipping stop report");
    return;
  }
  if (queuedForAutoplay || hasMoreInPlaylist) {
    debugLog("More episodes in playlist, mpv will play next episode — skipping stop cleanup");
    clearQueuedFlag();
    currentLoadedFileUrl = null;
    return;
  }
  currentLoadedFileUrl = null;
  stopPlaybackTracking();
  handlePlaybackTermination("end-file");
});

event.on("iina.window-will-close", () => {
  if (isWindowClosing) return;
  isWindowClosing = true;

  debugLog("Window closing, stopping playback tracking");
  currentLoadedFileUrl = null;
  resetForNewFile();
  clearQueuedFlag();
  if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
    iinaGlobal.postMessage("player-unregistered", {});
    iinaGlobal.postMessage("player-inactive", {});
  }
  stopPlaybackTracking();
  handlePlaybackTermination("window-close");
});

event.on("iina.application-will-terminate", () => {
  isWindowClosing = true;
  debugLog("Application terminating, stopping playback tracking");
  stopPlaybackTracking();
});
