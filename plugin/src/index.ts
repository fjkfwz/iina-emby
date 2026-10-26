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
import { createSafeHttp } from "./lib/safe-http";
import { createServerSessionStore } from "./lib/server-session-store";
import type { PlayMediaListMessage, PlayMediaMessage } from "./lib/webview-bridge";

const { core, console: iinaConsole, menu, event, http, utils, preferences, mpv, global: iinaGlobal, file } = iina;

const debugLog = createDebugLogger(preferences, iinaConsole, file);

// Use safe HTTP wrapper (curl via utils.exec) to avoid IINA 1.5.0 crash on NSURLSession callbacks
const safeHttp = createSafeHttp(utils, debugLog);

const { buildEmbyHeaders, parseEmbyUrl, isEmbyUrl, fetchPlaybackInfo, fetchItemMetadata, secondsToTicks, ticksToSeconds } = createEmbyApi({
  http: safeHttp,
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
  http: safeHttp,
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
  http: safeHttp,
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

const { setVideoTitleFromMetadata, downloadAllSubtitles, downloadExternalSubtitle, manualDownloadSubtitles, manualSetTitle, updateFromFileUrl } =
  createMediaActionsManager({
    core,
    http: safeHttp,
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

import { findMatchingAudioTrack, findMatchingSubtitleTrack, type MpvTrack } from "./lib/track-matcher";

const {
  handlePlayMedia,
  handlePlayMediaList,
  flushPendingPlaylistQueue,
  consumeReplacementGuard,
  markLaunchedFromBrowser,
  clearLaunchedFromBrowser,
  consumeLaunchedFromBrowser,
  isLaunchedFromBrowser,
  getPendingMediaTitle,
  getPendingStartPosition,
  getPendingAudioIndex,
  getPendingSubtitleIndex,
  getPendingAudioTrackNumber,
  getPendingSubtitleTrackNumber,
  getPendingAudioLanguage,
  getPendingSubtitleLanguage,
  getPendingIsExternalSubtitle,
  getPendingSubtitlePath,
  getPendingSubtitleCodec,
  getPendingMediaSourceId,
  getPendingSubtitleDeliveryUrl,
  getPendingSubtitleTitle,
  clearPendingSubtitle,
  clearPendingAudio,
  clearPendingTracks,
  setPendingPlaybackData,
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
    isDownloadingExternalSubtitle = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMedia(data);
  });
  iinaGlobal.onMessage("play-media-list-command", (data?: PlayMediaListMessage) => {
    debugLog("Received play-media-list-command from global entry", data);
    isWindowClosing = false;
    isDownloadingExternalSubtitle = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMediaList(data);
  });
  iinaGlobal.onMessage("apply-pending-media", (data?: PlayMediaMessage) => {
    debugLog("Received apply-pending-media from global entry", data);
    if (!data) return;
    markLaunchedFromBrowser();
    setPendingPlaybackData(data);

    const startPosSeconds =
      typeof data.startPositionSeconds === "number" && data.startPositionSeconds > 0
        ? data.startPositionSeconds
        : typeof data.startPositionTicks === "number" && data.startPositionTicks > 0
          ? ticksToSeconds(data.startPositionTicks)
          : null;

    if (typeof startPosSeconds === "number" && startPosSeconds > 0) {
      try {
        const timePos = mpv.getNumber("time-pos") || 0;
        if (timePos < 2) {
          debugLog(`Seeking to pending start position: ${startPosSeconds}s`);
          mpv.set("time-pos", startPosSeconds);
        }
      } catch {
        // Ignore
      }
    }

    const applyTracksNow = () => {
      const resolvedUrl = getEffectiveFileUrl();
      if (!resolvedUrl) return;
      const embyInfo = parseEmbyUrl(resolvedUrl);
      if (!embyInfo) return;
      let reportServerBase = embyInfo.serverBase;
      let reportApiKey = embyInfo.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    };

    applyTracksNow();
    setTimeout(applyTracksNow, 200);
    setTimeout(applyTracksNow, 600);
    setTimeout(applyTracksNow, 1200);
  });
}

// Request pending media from global entry on player entry initialization
if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
  iinaGlobal.postMessage("get-pending-media", {});
  iinaGlobal.postMessage("player-active", {});
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

// Track Enforcement Guard during initial playback startup
let targetSidToEnforce: number | "no" | null = null;
let targetAidToEnforce: number | null = null;
let enforcementStartTime = 0;
let enforcementReapplyCount = 0;
let enforcementItemId: string | null = null;
const ENFORCEMENT_DURATION_MS = 10000;
const MAX_ENFORCEMENT_REAPPLIES = 8;
let enforcementTimer: ReturnType<typeof setTimeout> | null = null;

function startEnforcingTracks(itemId: string, sid: number | "no" | null, aid: number | null): void {
  enforcementItemId = itemId;
  if (sid !== null) {
    targetSidToEnforce = sid;
  }
  if (aid !== null) {
    targetAidToEnforce = aid;
  }
  enforcementStartTime = Date.now();
  enforcementReapplyCount = 0;

  if (enforcementTimer) {
    clearTimeout(enforcementTimer);
  }
  enforcementTimer = setTimeout(() => {
    const expiredItemId = enforcementItemId;
    stopEnforcingTracks();
    if (expiredItemId) {
      clearPendingTracks(expiredItemId);
    }
  }, ENFORCEMENT_DURATION_MS);
}

function stopEnforcingTracks(): void {
  if (enforcementTimer) {
    clearTimeout(enforcementTimer);
    enforcementTimer = null;
  }
  targetSidToEnforce = null;
  targetAidToEnforce = null;
  enforcementStartTime = 0;
  enforcementReapplyCount = 0;
  enforcementItemId = null;
}

function applySelectedAudioTrack(itemId: string): void {
  const pendingAudio = getPendingAudioIndex(itemId);
  const pendingAudioTrackNum = getPendingAudioTrackNumber(itemId);
  const pendingAudioLang = getPendingAudioLanguage(itemId);

  if (typeof pendingAudio !== "number" && typeof pendingAudioTrackNum !== "number") {
    return;
  }

  try {
    debugLog(`Applying user-selected audio track: Index=${pendingAudio}, TrackNum=${pendingAudioTrackNum}, Lang=${pendingAudioLang}`);
    const trackList = mpv.getNative<MpvTrack[]>("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      // Tracks not ready yet, will be applied on tracks-changed
      return;
    }

    const audioTracks = trackList.filter((t) => t.type === "audio");
    if (audioTracks.length === 0) {
      debugLog("No audio tracks found in mpv track-list");
      return;
    }

    const match = findMatchingAudioTrack(audioTracks, {
      trackNumber: pendingAudioTrackNum,
      streamIndex: pendingAudio,
      language: pendingAudioLang,
    });

    const targetAid =
      match && typeof match.id === "number"
        ? match.id
        : typeof pendingAudioTrackNum === "number" && pendingAudioTrackNum > 0
          ? pendingAudioTrackNum
          : null;

    if (targetAid !== null) {
      const currentAid = mpv.getString("aid") || "";
      const aidStr = String(targetAid);
      debugLog(`Applying audio track targetAid=${targetAid}, current mpv.aid=${currentAid}`);

      if (currentAid !== aidStr) {
        debugLog(`Setting audio track id: ${aidStr} (current was ${currentAid})`);
        try {
          if (core?.audio) {
            (core.audio as any).currentTrack = targetAid;
          }
        } catch {}
        try {
          mpv.set("aid", aidStr);
        } catch (e) {
          debugLog("mpv.set aid error:", e);
        }
      }

      startEnforcingTracks(itemId, null, targetAid);
    }
  } catch (err) {
    debugLog("Failed to set audio track:", err);
  }
}

let isDownloadingExternalSubtitle = false;

async function applySelectedSubtitleTrack(
  serverBase: string,
  itemId: string,
  apiKey: string,
): Promise<void> {
  const pendingSubtitle = getPendingSubtitleIndex(itemId);
  const pendingSubTrackNum = getPendingSubtitleTrackNumber(itemId);
  const pendingSubLang = getPendingSubtitleLanguage(itemId);
  const isExternal = getPendingIsExternalSubtitle(itemId);
  const subCodec = getPendingSubtitleCodec(itemId);
  const subPath = getPendingSubtitlePath(itemId);
  const mediaSourceId = getPendingMediaSourceId(itemId);
  const deliveryUrl = getPendingSubtitleDeliveryUrl(itemId);
  const subtitleTitle = getPendingSubtitleTitle(itemId);

  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number") {
    return;
  }

  // 1. Subtitles turned off
  if (pendingSubtitle === -1) {
    debugLog("User selected to turn off subtitles");
    try {
      const currentSid = mpv.getString("sid");
      if (currentSid !== "no" && currentSid !== "0") {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      }
    } catch {
      // Ignore
    }
    startEnforcingTracks(itemId, "no", null);
    return;
  }

  // 2. External subtitle selected
  if (isExternal && typeof pendingSubtitle === "number") {
    const effectiveUrl = getEffectiveFileUrl();
    if (!effectiveUrl) {
      debugLog("Playback not ready yet, deferring external subtitle load to file-loaded event");
      return;
    }

    if (isDownloadingExternalSubtitle) {
      debugLog("External subtitle download already in progress, skipping duplicate call");
      return;
    }

    debugLog(`Selected subtitle is external (Index: ${pendingSubtitle}, MediaSourceId: ${mediaSourceId || "none"}). Downloading and loading...`);
    try {
      isDownloadingExternalSubtitle = true;
      const loaded = await downloadExternalSubtitle(
        serverBase,
        itemId,
        mediaSourceId || null,
        pendingSubtitle,
        subPath || undefined,
        apiKey,
        pendingSubLang || "und",
        subCodec || "srt",
        deliveryUrl || null,
        subtitleTitle || null,
      );
      if (loaded) {
        debugLog("External subtitle loaded successfully");
        clearPendingSubtitle(itemId);
        return;
      } else {
        debugLog("External subtitle download returned false, will retry on file-loaded if still pending");
      }
    } catch (err) {
      debugLog("Failed to load selected external subtitle:", err);
    } finally {
      isDownloadingExternalSubtitle = false;
    }
    return;
  }

  // 3. Embedded subtitle track
  try {
    debugLog(
      `Applying embedded subtitle track: Index=${pendingSubtitle}, TrackNum=${pendingSubTrackNum}, Lang=${pendingSubLang}, Title=${subtitleTitle}`,
    );
    const trackList = mpv.getNative<MpvTrack[]>("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      debugLog("Tracks not ready yet in track-list, will be applied on tracks-changed");
      return;
    }

    const subTracks = trackList.filter((t) => t.type === "sub");
    if (subTracks.length === 0) {
      debugLog("No subtitle tracks found in mpv track-list yet, will be applied on tracks-changed");
      return;
    }

    const match = findMatchingSubtitleTrack(subTracks, {
      trackNumber: pendingSubTrackNum,
      streamIndex: pendingSubtitle,
      language: pendingSubLang,
      title: subtitleTitle,
      codec: subCodec,
    });

    const targetSid =
      match && typeof match.id === "number"
        ? match.id
        : typeof pendingSubTrackNum === "number" && pendingSubTrackNum > 0
          ? pendingSubTrackNum
          : null;

    if (targetSid !== null) {
      const currentSid = mpv.getString("sid") || "";
      const sidStr = String(targetSid);
      debugLog(
        `Applying subtitle track targetSid=${targetSid} (matched id: ${match?.id}, lang: ${match?.lang}, title: ${match?.title}), current mpv.sid=${currentSid}`,
      );

      if (currentSid !== sidStr) {
        debugLog(`Setting subtitle track id: ${sidStr} (current was ${currentSid})`);
        try {
          if (core?.subtitle) {
            (core.subtitle as any).currentTrack = targetSid;
          }
        } catch {}
        try {
          mpv.set("sid", sidStr);
          mpv.set("sub-visibility", true);
        } catch (e) {
          debugLog("mpv.set sid error:", e);
        }
      }

      startEnforcingTracks(itemId, targetSid, null);
    }
  } catch (err) {
    debugLog("Failed to set subtitle track:", err);
  }
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
    debugLog(`File ${resolvedUrl} already initialized, re-checking pending tracks`);
    const embyInfo = parseEmbyUrl(resolvedUrl);
    if (embyInfo) {
      let reportServerBase = embyInfo.serverBase;
      let reportApiKey = embyInfo.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    }
    return;
  }
  currentLoadedFileUrl = resolvedUrl;
  stopEnforcingTracks();

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

    const isBrowser = isLaunchedFromBrowser();

    // Start playback tracking for progress sync
    if (preferences.get("sync_playback_progress")) {
      const pendingStart = getPendingStartPosition(embyInfo.itemId);
      debugLog(
        `Starting playback tracking for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}, pendingStart: ${pendingStart ?? "none"}, isBrowser: ${isBrowser}`,
      );
      startPlaybackTracking(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId, pendingStart, isBrowser);
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
      } else if (!isBrowser) {
        debugLog(`Setting video title from metadata for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
        setVideoTitleFromMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      }
    }

    // Setup autoplay for TV episodes if enabled (only when not launched from browser)
    if (!isBrowser && preferences.get("autoplay_next_episode")) {
      debugLog(`Setting up autoplay for episode (itemId): ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
      resetForNewFile();
      setupAutoplayForEpisode(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }

    // Apply user-selected audio track and subtitle track if specified from detail page
    const applyTracksNow = () => {
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    };
    applyTracksNow();
    setTimeout(applyTracksNow, 250);
    setTimeout(applyTracksNow, 750);
    setTimeout(applyTracksNow, 1500);

    const pendingSubtitle = getPendingSubtitleIndex(embyInfo.itemId);

    // Only auto-download if enabled, user didn't disable subtitles, and media not launched from browser
    if (!isBrowser && pendingSubtitle !== -1 && preferences.get("auto_download_enabled")) {
      debugLog(`Auto-downloading subtitles for: ${embyInfo.itemId}`);
      const hasSpecificSubSelected = typeof pendingSubtitle === "number";
      downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey).then(() => {
        if (hasSpecificSubSelected) {
          applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
        }
      });
    } else if (pendingSubtitle === -1) {
      debugLog("Subtitles turned off by user, skipping auto-download of external subtitles");
      try {
        const currentSid = mpv.getString("sid");
        if (currentSid !== "no" && currentSid !== "0") {
          mpv.set("sid", "no");
          mpv.command("set", ["sid", "no"]);
        }
      } catch {
        // Ignore
      }
      startEnforcingTracks(embyInfo.itemId, "no", null);
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
});

event.on("mpv.file-loaded", () => {
  isWindowClosing = false;
  onFileLoaded();
});

const handleTracksChanged = () => {
  if (isWindowClosing) return;
  const resolvedUrl = getEffectiveFileUrl();
  debugLog(`Track list changed event received for URL: ${resolvedUrl}`);
  if (resolvedUrl) {
    const embyInfo = parseEmbyUrl(resolvedUrl);
    if (embyInfo) {
      let reportServerBase = embyInfo.serverBase;
      let reportApiKey = embyInfo.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    }
  }
};

event.on("mpv.track-list.changed", handleTracksChanged);
event.on("mpv.tracks-changed", handleTracksChanged);

event.on("mpv.sid.changed", (newSidVal: unknown) => {
  if (isWindowClosing || targetSidToEnforce === null) return;

  const elapsed = Date.now() - enforcementStartTime;
  if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
    debugLog(`Track enforcement window ended for sid (elapsed=${elapsed}ms, reapplies=${enforcementReapplyCount})`);
    targetSidToEnforce = null;
    return;
  }

  const currentSidStr = String(newSidVal ?? "");

  if (targetSidToEnforce === "no") {
    if (currentSidStr !== "no" && currentSidStr !== "0" && currentSidStr !== "false" && newSidVal !== null) {
      debugLog(`Enforcement: Re-disabling subtitles (was set to ${newSidVal} by player core)`);
      enforcementReapplyCount++;
      try {
        if (core?.subtitle) {
          (core.subtitle as any).currentTrack = null;
        }
      } catch {}
      try {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      } catch (err) {
        debugLog("Error re-disabling subtitles:", err);
      }
    }
  } else if (targetSidToEnforce !== null) {
    const targetStr = String(targetSidToEnforce);
    if (currentSidStr !== targetStr) {
      debugLog(`Enforcement: Re-applying target subtitle track ${targetStr} (was set to ${newSidVal} by player core)`);
      enforcementReapplyCount++;
      try {
        if (core?.subtitle) {
          (core.subtitle as any).currentTrack = targetSidToEnforce;
        }
      } catch {}
      try {
        mpv.set("sid", targetStr);
        mpv.set("sub-visibility", true);
      } catch (err) {
        debugLog("Error re-applying subtitle track:", err);
      }
    }
  }
});

event.on("mpv.aid.changed", (newAidVal: unknown) => {
  if (isWindowClosing || targetAidToEnforce === null) return;

  const elapsed = Date.now() - enforcementStartTime;
  if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
    targetAidToEnforce = null;
    return;
  }

  const currentAidStr = String(newAidVal ?? "");
  const targetStr = String(targetAidToEnforce);
  if (currentAidStr !== targetStr) {
    debugLog(`Enforcement: Re-applying target audio track ${targetStr} (was set to ${newAidVal})`);
    enforcementReapplyCount++;
    try {
      if (core?.audio) {
        (core.audio as any).currentTrack = targetAidToEnforce;
      }
    } catch {}
    try {
      mpv.set("aid", targetStr);
    } catch (err) {
      debugLog("Error re-applying audio track:", err);
    }
  }
});

event.on("mpv.path.changed", (newPath: unknown) => {
  if (typeof newPath === "string" && newPath.trim().length > 0) {
    isWindowClosing = false;
    currentLoadedFileUrl = null;
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
  stopEnforcingTracks();
  clearPendingTracks();
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
  stopEnforcingTracks();
  clearPendingTracks();
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
