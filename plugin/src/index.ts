/**
 * IINA Emby Plugin
 */

import { formatFullEpisodeTitle, isGenericOrEmptySubtitleTitle, isSameEmbyHost } from "@shared";
import { createAutoplayManager } from "./lib/autoplay-manager";
import { createDebugLogger } from "./lib/debug-log";
import { createEmbyApi } from "./lib/emby-api";
import { createIntroManager } from "./lib/intro-manager";
import { createMediaActionsManager } from "./lib/media-actions";
import { createOutroManager } from "./lib/outro-manager";
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

const { startPlaybackTracking, stopPlaybackTracking, handlePauseChange, getCurrentPlaybackSession, updateActiveTracks, markAsWatched } =
  createPlaybackTrackingManager({
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

const {
  setVideoTitleFromMetadata,
  downloadAllSubtitles,
  downloadExternalSubtitle,
  manualDownloadSubtitles,
  manualSetTitle,
  updateFromFileUrl,
} = createMediaActionsManager({
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

import type { EmbyItemMetadata } from "@shared";
import {
  findBestAudioTrackByPreference,
  findBestSubtitleTrackByPreference,
  findEmbyStreamIndexForMpvTrack,
  findMatchingAudioTrack,
  findMatchingSubtitleTrack,
  type LightEmbyStream,
  type MpvTrack,
} from "./lib/track-matcher";
import { clearTrackSelection, getSavedTrackSelection, saveTrackSelection } from "./lib/track-preference-store";

let currentEmbyStreams: LightEmbyStream[] = [];
let currentItemMetadata: EmbyItemMetadata | null = null;
let currentActiveItemId: string | null = null;
let currentActiveSeriesId: string | null = null;
let currentActiveAudioStreamIndex: number | null = null;
let currentActiveSubtitleStreamIndex: number | null = null;

const {
  handlePlayMedia,
  handlePlayMediaList,
  queueRemainingPlaylistItems,
  flushPendingPlaylistQueue,
  consumeReplacementGuard,
  markReplacingPlayback,
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

const introManager = createIntroManager({
  core,
  mpv,
  preferences,
  log: debugLog,
});

const outroManager = createOutroManager({
  core,
  mpv,
  preferences,
  markReplacingPlayback,
  markAsWatched,
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
  iinaGlobal.onMessage("queue-pending-playlist", (data?: PlayMediaListMessage) => {
    debugLog("Received queue-pending-playlist from global entry", data);
    if (!data?.items || data.items.length <= 1) return;
    const queuedItems = data.items.slice(1);
    const firstItem = data.items[0];
    const firstItemId =
      (firstItem as any)?.itemId || (String(firstItem.streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1] || null;
    markLaunchedFromBrowser();
    queueRemainingPlaylistItems(queuedItems, firstItemId);
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
      let reportUserId: string | undefined;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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
const ENFORCEMENT_DURATION_MS = 1500;
const MAX_ENFORCEMENT_REAPPLIES = 2;
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

function snapshotCurrentTracksAndSave(source: string): void {
  if (isWindowClosing || !currentActiveItemId) return;
  if (preferences.get("remember_track_selections") === false) return;

  try {
    const trackList = mpv.getNative<MpvTrack[]>("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) return;

    // 1. Audio track
    const currentAid = mpv.getString("aid");
    const activeAudio = trackList.find((t) => t.type === "audio" && (String(t.id) === currentAid || Boolean(t.selected)));
    const audioStreamIndex = activeAudio ? findEmbyStreamIndexForMpvTrack(activeAudio, currentEmbyStreams, "Audio") : null;

    const audioChannels =
      activeAudio && typeof activeAudio["channel-count"] === "number"
        ? activeAudio["channel-count"]
        : activeAudio && typeof activeAudio.channels === "number"
          ? activeAudio.channels
          : null;

    const channelLayout =
      activeAudio && typeof activeAudio["demux-channels"] === "string"
        ? activeAudio["demux-channels"]
        : audioChannels === 6
          ? "5.1"
          : audioChannels === 8
            ? "7.1"
            : audioChannels === 2
              ? "stereo"
              : null;

    // 2. Subtitle track
    const currentSid = mpv.getString("sid");
    let subVisibility = true;
    try {
      subVisibility = mpv.getFlag("sub-visibility");
    } catch {
      const visStr = mpv.getString("sub-visibility");
      subVisibility = visStr !== "no" && visStr !== "false";
    }
    const isSubOff = subVisibility === false || currentSid === "no" || currentSid === "0" || currentSid === "false" || !currentSid;

    let subStreamIndex: number | null = -1;
    let activeSub: MpvTrack | undefined;

    if (!isSubOff) {
      activeSub = trackList.find((t) => t.type === "sub" && (String(t.id) === currentSid || Boolean(t.selected)));
      if (activeSub) {
        subStreamIndex = findEmbyStreamIndexForMpvTrack(activeSub, currentEmbyStreams, "Subtitle");
      }
    }

    debugLog(
      `[SaveTracks] (${source}) itemId=${currentActiveItemId}, audioStreamIndex=${audioStreamIndex} (aid=${currentAid}), subStreamIndex=${subStreamIndex} (sid=${currentSid}, vis=${subVisibility})`,
    );

    saveTrackSelection(
      preferences,
      currentActiveItemId,
      {
        audioStreamIndex,
        subtitleStreamIndex: subStreamIndex,
        audioLanguage: activeAudio?.lang || null,
        audioTitle: activeAudio?.title || null,
        audioChannels,
        channelLayout,
        subtitleLanguage: isSubOff ? "off" : activeSub?.lang || null,
        subtitleTitle: isSubOff ? null : activeSub?.title || null,
      },
      currentActiveSeriesId || undefined,
    );

    currentActiveAudioStreamIndex = audioStreamIndex;
    currentActiveSubtitleStreamIndex = subStreamIndex;
    updateActiveTracks(audioStreamIndex, subStreamIndex);
  } catch (err) {
    debugLog("[SaveTracks] Error capturing tracks:", err);
  }
}

async function applySelectedAudioTrack(serverBase: string, itemId: string, apiKey: string, userId?: string): Promise<void> {
  try {
    const trackList = mpv.getNative<MpvTrack[]>("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      return;
    }

    const audioTracks = trackList.filter((t) => t.type === "audio");
    if (audioTracks.length === 0) {
      debugLog("No audio tracks found in mpv track-list");
      return;
    }

    let targetAudio = getPendingAudioIndex(itemId);
    let targetAudioTrackNum = getPendingAudioTrackNumber(itemId);
    let targetAudioLang = getPendingAudioLanguage(itemId);
    let targetAudioChannels: number | null | undefined;
    let targetChannelLayout: string | null | undefined;

    // 1. If not specified by explicit pending message, check remembered track selection
    if (typeof targetAudio !== "number" && typeof targetAudioTrackNum !== "number" && !targetAudioLang) {
      if (preferences.get("remember_track_selections") !== false) {
        const saved = getSavedTrackSelection(preferences, itemId, currentActiveSeriesId || undefined);
        if (saved) {
          if (typeof saved.audioStreamIndex === "number") {
            targetAudio = saved.audioStreamIndex;
          }
          if (saved.audioLanguage) {
            targetAudioLang = saved.audioLanguage;
          }
          if (typeof saved.audioChannels === "number") {
            targetAudioChannels = saved.audioChannels;
          }
          if (saved.channelLayout) {
            targetChannelLayout = saved.channelLayout;
          }
          debugLog(
            `[Audio] Using remembered selection for ${itemId}: streamIndex=${targetAudio}, lang=${targetAudioLang}, channels=${targetAudioChannels}, layout=${targetChannelLayout}`,
          );
        }
      }
    }

    // 2. If still not found, check Emby's DefaultAudioStreamIndex from playback info
    if (typeof targetAudio !== "number" && typeof targetAudioTrackNum !== "number" && !targetAudioLang) {
      try {
        if (currentEmbyStreams.length === 0) {
          const pb = await fetchPlaybackInfo(serverBase, itemId, apiKey, userId);
          if (pb?.MediaSources?.[0]?.MediaStreams) {
            currentEmbyStreams = pb.MediaSources[0].MediaStreams as LightEmbyStream[];
          }
          if (typeof pb?.MediaSources?.[0]?.DefaultAudioStreamIndex === "number") {
            targetAudio = pb.MediaSources[0].DefaultAudioStreamIndex;
            debugLog(`[Audio] Using Emby server DefaultAudioStreamIndex: ${targetAudio}`);
          }
        }
      } catch (e) {
        debugLog("Failed to fetch PlaybackInfo for default audio:", e);
      }
    }

    let match: MpvTrack | undefined;

    // 3. Match using track criteria if any was found
    if (typeof targetAudio === "number" || typeof targetAudioTrackNum === "number" || targetAudioLang) {
      match = findMatchingAudioTrack(audioTracks, {
        trackNumber: targetAudioTrackNum,
        streamIndex: targetAudio,
        language: targetAudioLang,
        channels: targetAudioChannels,
        channelLayout: targetChannelLayout,
        embyStreams: currentEmbyStreams,
      });
    }

    // 4. If no match, match using global preferred language and channel layout
    if (!match) {
      const preferredAudioLang = (preferences.get("preferred_audio_language") as string) || "zh,chi,ja,jpn,en,eng";
      const preferredChannel = (preferences.get("preferred_audio_channel") as string) || "auto";
      match = findBestAudioTrackByPreference(audioTracks, preferredAudioLang, preferredChannel);
      if (match) {
        debugLog(`[Audio] Using global preference match: trackId=${match.id}, lang=${match.lang}, title=${match.title}`);
      }
    }

    const targetAid = match && typeof match.id === "number" ? match.id : null;

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

      const embyAudioIdx = findEmbyStreamIndexForMpvTrack(match, currentEmbyStreams, "Audio");
      currentActiveAudioStreamIndex = embyAudioIdx;
      updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
      snapshotCurrentTracksAndSave("apply-selected-audio");
    }
  } catch (err) {
    debugLog("Failed to set audio track:", err);
  }
}

let isDownloadingExternalSubtitle = false;

async function applySelectedSubtitleTrack(serverBase: string, itemId: string, apiKey: string, userId?: string): Promise<void> {
  let pendingSubtitle = getPendingSubtitleIndex(itemId);
  let pendingSubTrackNum = getPendingSubtitleTrackNumber(itemId);
  let pendingSubLang = getPendingSubtitleLanguage(itemId);
  let isExternal = getPendingIsExternalSubtitle(itemId);
  let subCodec = getPendingSubtitleCodec(itemId);
  let subPath = getPendingSubtitlePath(itemId);
  let mediaSourceId = getPendingMediaSourceId(itemId);
  let deliveryUrl = getPendingSubtitleDeliveryUrl(itemId);
  let subtitleTitle = getPendingSubtitleTitle(itemId);

  // 1. If not specified by explicit pending message, check remembered track selection
  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number" && !pendingSubLang) {
    if (preferences.get("remember_track_selections") !== false) {
      const saved = getSavedTrackSelection(preferences, itemId, currentActiveSeriesId || undefined);
      if (saved) {
        if (saved.subtitleStreamIndex === -1 || saved.subtitleLanguage === "off") {
          pendingSubtitle = -1;
        } else if (typeof saved.subtitleStreamIndex === "number") {
          pendingSubtitle = saved.subtitleStreamIndex;
        }
        if (saved.subtitleLanguage && saved.subtitleLanguage !== "off") {
          pendingSubLang = saved.subtitleLanguage;
        }
        debugLog(`[Subtitle] Using remembered selection for ${itemId}: streamIndex=${pendingSubtitle}, lang=${pendingSubLang}`);
      }
    }
  }

  // 2. If still not found, check Emby's DefaultSubtitleStreamIndex from playback info
  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number" && !pendingSubLang) {
    try {
      if (currentEmbyStreams.length === 0) {
        const pb = await fetchPlaybackInfo(serverBase, itemId, apiKey, userId);
        if (pb?.MediaSources?.[0]?.MediaStreams) {
          currentEmbyStreams = pb.MediaSources[0].MediaStreams as LightEmbyStream[];
        }
        if (typeof pb?.MediaSources?.[0]?.DefaultSubtitleStreamIndex === "number") {
          pendingSubtitle = pb.MediaSources[0].DefaultSubtitleStreamIndex;
          debugLog(`[Subtitle] Using Emby server DefaultSubtitleStreamIndex: ${pendingSubtitle}`);
        }
      }
    } catch (e) {
      debugLog("Failed to fetch PlaybackInfo for default subtitle:", e);
    }
  }

  // 3. Subtitles turned off
  if (pendingSubtitle === -1) {
    debugLog("Subtitles turned off by user or remembered preference");
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
    currentActiveSubtitleStreamIndex = -1;
    updateActiveTracks(currentActiveAudioStreamIndex, -1);
    snapshotCurrentTracksAndSave("apply-sub-off");
    return;
  }

  // If pendingSubtitle points to an external stream in currentEmbyStreams, populate external metadata
  if (typeof pendingSubtitle === "number" && currentEmbyStreams.length > 0) {
    const matchedStream = currentEmbyStreams.find((s) => s.Index === pendingSubtitle && s.Type === "Subtitle");
    if (matchedStream) {
      if (matchedStream.IsExternal) {
        isExternal = true;
        subCodec = matchedStream.Codec || subCodec;
        subPath = (matchedStream.Path as string) || subPath;
        deliveryUrl = (matchedStream.DeliveryUrl as string) || deliveryUrl;
        subtitleTitle = matchedStream.DisplayTitle || matchedStream.Title || subtitleTitle;
        pendingSubLang = matchedStream.Language || pendingSubLang;
      }
    }
  }

  // 4. External subtitle selected
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

    debugLog(
      `Selected subtitle is external (Index: ${pendingSubtitle}, MediaSourceId: ${mediaSourceId || "none"}). Downloading and loading...`,
    );
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
        currentActiveSubtitleStreamIndex = pendingSubtitle;
        updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
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

  // 5. Embedded subtitle track
  try {
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

    let match: MpvTrack | undefined;

    if (typeof pendingSubtitle === "number" || typeof pendingSubTrackNum === "number" || pendingSubLang) {
      match = findMatchingSubtitleTrack(subTracks, {
        trackNumber: pendingSubTrackNum,
        streamIndex: pendingSubtitle,
        language: pendingSubLang,
        title: subtitleTitle,
        codec: subCodec,
        embyStreams: currentEmbyStreams,
      });
    }

    // 6. If no match and auto_select_subtitles is true, match against global preference
    if (!match && preferences.get("auto_select_subtitles") !== false) {
      const preferredSubLang = (preferences.get("preferred_subtitle_language") as string) || "zh,chi,chs,sc,cht,tc,en";
      match = findBestSubtitleTrackByPreference(subTracks, preferredSubLang);
      if (match) {
        debugLog(`[Subtitle] Using global preference match: trackId=${match.id}, lang=${match.lang}, title=${match.title}`);
      }
    }

    const targetSid = match && typeof match.id === "number" ? match.id : null;

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

      if (preferences.get("show_notifications")) {
        const cleanTitle =
          subtitleTitle && !isGenericOrEmptySubtitleTitle(subtitleTitle)
            ? subtitleTitle
            : pendingSubLang
              ? `${pendingSubLang.toUpperCase()} 字幕`
              : "字幕";
        core.osd(`字幕: ${cleanTitle}`);
      }

      const embySubIdx = findEmbyStreamIndexForMpvTrack(match, currentEmbyStreams, "Subtitle");
      currentActiveSubtitleStreamIndex = embySubIdx;
      updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
      snapshotCurrentTracksAndSave("apply-selected-sub");
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
      let reportUserId: string | undefined;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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

    currentActiveItemId = embyInfo.itemId;
    currentActiveSeriesId = null;
    currentEmbyStreams = [];
    currentActiveAudioStreamIndex = getPendingAudioIndex(embyInfo.itemId);
    currentActiveSubtitleStreamIndex = getPendingSubtitleIndex(embyInfo.itemId);

    introManager.resetForNewFile();
    introManager.setSession(embyInfo.itemId);
    introManager.checkMpvChapters();

    outroManager.resetForNewFile();
    outroManager.setSession(reportServerBase, embyInfo.itemId, reportApiKey);
    outroManager.checkMpvChapters();

    // Pre-fetch PlaybackInfo and Metadata to get seriesId and mediaStreams
    fetchPlaybackInfo(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId)
      .then((pb) => {
        if (pb?.MediaSources?.[0]?.MediaStreams) {
          currentEmbyStreams = pb.MediaSources[0].MediaStreams as LightEmbyStream[];
        }
      })
      .catch((e) => {
        debugLog("Error pre-fetching PlaybackInfo streams:", e);
      });

    fetchItemMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId)
      .then((meta) => {
        currentItemMetadata = meta;
        if (meta?.SeriesId) {
          currentActiveSeriesId = meta.SeriesId;
        }
        introManager.updateMetadataChapters(meta?.Chapters);
        outroManager.updateMetadataChapters(meta?.Chapters);
        if (preferences.get("set_video_title") && meta) {
          const known = getPendingMediaTitle(embyInfo.itemId);
          if (!known) {
            let episodeTitle = meta.Name;
            if (meta.Type === "Episode") {
              episodeTitle = formatFullEpisodeTitle(meta.SeriesName, meta.ParentIndexNumber, meta.IndexNumber, meta.Name);
            } else if (meta.Type === "Movie" && meta.ProductionYear) {
              episodeTitle = `${meta.Name} (${meta.ProductionYear})`;
            }
            if (episodeTitle) {
              try {
                mpv.set("force-media-title", episodeTitle);
                debugLog(`Updated video title from fetched metadata: ${episodeTitle}`);
              } catch {
                // Ignore
              }
              try {
                mpv.set("title", episodeTitle);
              } catch {
                // Ignore
              }
            }
          }
        }
      })
      .catch((e) => {
        debugLog("Error pre-fetching item metadata:", e);
      });

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
      startPlaybackTracking(
        reportServerBase,
        embyInfo.itemId,
        reportApiKey,
        reportUserId,
        pendingStart,
        isBrowser,
        currentActiveAudioStreamIndex,
        currentActiveSubtitleStreamIndex,
      );
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
        try {
          mpv.set("title", knownTitle);
        } catch {
          // Ignore
        }
      } else {
        try {
          mpv.set("force-media-title", "");
        } catch {
          // Ignore
        }
        debugLog(`Setting video title from metadata for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
        setVideoTitleFromMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      }
    }

    // Setup autoplay for TV episodes if enabled
    if (preferences.get("autoplay_next_episode")) {
      debugLog(`Setting up autoplay for episode (itemId): ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
      resetForNewFile();
      setupAutoplayForEpisode(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }

    // Apply user-selected audio track and subtitle track if specified from detail page or preferences
    const applyTracksNow = async () => {
      try {
        if (currentEmbyStreams.length === 0) {
          const pb = await fetchPlaybackInfo(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
          if (pb?.MediaSources?.[0]?.MediaStreams) {
            currentEmbyStreams = pb.MediaSources[0].MediaStreams as LightEmbyStream[];
          }
        }
      } catch (e) {
        debugLog("Error pre-fetching PlaybackInfo streams:", e);
      }

      try {
        if (!currentActiveSeriesId) {
          const meta = await fetchItemMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
          if (meta?.SeriesId) {
            currentActiveSeriesId = meta.SeriesId;
          }
          introManager.updateMetadataChapters(meta?.Chapters);
          outroManager.updateMetadataChapters(meta?.Chapters);
        }
      } catch (e) {
        debugLog("Error pre-fetching item metadata:", e);
      }

      await applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      await applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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
      downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey, pendingSubtitle).then(() => {
        if (hasSpecificSubSelected) {
          applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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
  snapshotCurrentTracksAndSave(`termination-${reason}`);
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
menu.addItem(menu.item("Skip Intro", () => {
  introManager.manualSkipIntro();
}));
menu.addItem(menu.item("Skip Outro", () => {
  outroManager.manualSkipOutro();
}));

// Event handlers
event.on("iina.file-loaded", onFileLoaded);

event.on("iina.file-started", () => {
  isWindowClosing = false;
});

event.on("mpv.file-loaded", () => {
  isWindowClosing = false;
  onFileLoaded();
  introManager.checkMpvChapters();
  outroManager.checkMpvChapters();
});

event.on("mpv.time-pos.changed", (newTimeVal: unknown) => {
  if (isWindowClosing || !currentActiveItemId) return;
  const timePos = typeof newTimeVal === "number" ? newTimeVal : Number(newTimeVal);
  if (!Number.isFinite(timePos)) return;
  introManager.checkAndTriggerSkip(timePos);
  outroManager.checkAndTriggerSkip(timePos);
});

event.on("mpv.chapter-list.changed", () => {
  if (isWindowClosing || !currentActiveItemId) return;
  introManager.checkMpvChapters();
  outroManager.checkMpvChapters();
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
      let reportUserId: string | undefined;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }
  }
};

event.on("mpv.track-list.changed", handleTracksChanged);
event.on("mpv.tracks-changed", handleTracksChanged);

event.on("mpv.sid.changed", (newSidVal: unknown) => {
  if (isWindowClosing || !currentActiveItemId) return;

  const currentSidStr = String(newSidVal ?? "");

  if (targetSidToEnforce !== null) {
    const targetStr = String(targetSidToEnforce);
    if (currentSidStr === targetStr) {
      debugLog(`Enforcement satisfied: mpv sid reached target ${targetStr}`);
      targetSidToEnforce = null;
      snapshotCurrentTracksAndSave("enforce-satisfied-sid");
      return;
    }

    const elapsed = Date.now() - enforcementStartTime;
    if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
      debugLog(`Enforcement window ended for sid (elapsed=${elapsed}ms). User switched to sid=${currentSidStr}`);
      targetSidToEnforce = null;
      snapshotCurrentTracksAndSave("user-switch-sid");
      return;
    }

    enforcementReapplyCount++;
    debugLog(`Enforcement: Re-applying target sid=${targetStr} (mpv set to ${newSidVal})`);
    try {
      if (targetSidToEnforce === "no") {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      } else {
        mpv.set("sid", targetStr);
        mpv.set("sub-visibility", true);
      }
    } catch {}
    return;
  }

  debugLog(`[User Action] Subtitle track changed to sid=${currentSidStr}`);
  snapshotCurrentTracksAndSave("user-switched-sid");
});

event.on("mpv.sub-visibility.changed", (vis: unknown) => {
  if (isWindowClosing || !currentActiveItemId) return;
  debugLog(`[User Action] Subtitle visibility changed to ${vis}`);
  snapshotCurrentTracksAndSave("sub-visibility-changed");
});

event.on("mpv.aid.changed", (newAidVal: unknown) => {
  if (isWindowClosing || !currentActiveItemId) return;

  const currentAidStr = String(newAidVal ?? "");

  if (targetAidToEnforce !== null) {
    const targetStr = String(targetAidToEnforce);
    if (currentAidStr === targetStr) {
      debugLog(`Enforcement satisfied: mpv aid reached target ${targetStr}`);
      targetAidToEnforce = null;
      snapshotCurrentTracksAndSave("enforce-satisfied-aid");
      return;
    }

    const elapsed = Date.now() - enforcementStartTime;
    if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
      debugLog(`Enforcement window ended for aid (elapsed=${elapsed}ms). User switched to aid=${currentAidStr}`);
      targetAidToEnforce = null;
      snapshotCurrentTracksAndSave("user-switch-aid");
      return;
    }

    enforcementReapplyCount++;
    debugLog(`Enforcement: Re-applying target aid=${targetStr} (mpv set to ${newAidVal})`);
    try {
      mpv.set("aid", targetStr);
    } catch {}
    return;
  }

  debugLog(`[User Action] Audio track changed to aid=${currentAidStr}`);
  snapshotCurrentTracksAndSave("user-switched-aid");
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
  snapshotCurrentTracksAndSave("pause-changed");
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
  introManager.resetForNewFile();
  outroManager.resetForNewFile();
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
  introManager.resetForNewFile();
  outroManager.resetForNewFile();
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
