import { sanitizeStreamUrl, ticksToSeconds } from "@shared";
import type { DebugLogger } from "./debug-log";
import type { PlayMediaListMessage, PlayMediaMessage } from "./webview-bridge";

export interface PlaylistItem {
  streamUrl: string;
  title?: string;
  [key: string]: unknown;
}

export interface PendingPlaylistQueue {
  items: PlaylistItem[];
  at: number;
  itemId: string | null;
}

export interface GlobalPlayerCreatedMessage {
  playerId?: string | number;
  title?: string;
  url?: string;
}

export interface GlobalPlayerFailedMessage {
  error?: string;
  url?: string;
}

export interface PlaybackCoordinatorDeps {
  core: typeof iina.core;
  mpv: typeof iina.mpv;
  preferences: typeof iina.preferences;
  file?: typeof iina.file;
  utils?: typeof iina.utils;
  global?: typeof iina.global;
  getCurrentPlaybackSession: () => unknown;
  clearQueuedFlag: () => void;
  log: DebugLogger;
}

const REPLACEMENT_GUARD_MS = 10000;
const PENDING_QUEUE_TTL_MS = 60000;

export function createPlaybackCoordinator({
  core,
  mpv,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  getCurrentPlaybackSession,
  clearQueuedFlag,
  log,
}: PlaybackCoordinatorDeps) {
  // Guard to prevent spurious stop reports during a file switch. Stored as a
  // timestamp and expired after REPLACEMENT_GUARD_MS: if the expected end-file
  // never arrives (e.g. core.open failed), a stale guard must not swallow the
  // stop report of the next file that really does finish.
  let replacingPlaybackAt = 0;

  // Track the most recent title and start position requested from the UI
  let currentPlaybackTitle: string | null = null;
  let currentPlaybackItemId: string | null = null;
  let currentPlaybackStartPositionSeconds: number | null = null;
  let currentPlaybackAudioIndex: number | null = null;
  let currentPlaybackSubtitleIndex: number | null = null;
  let currentPlaybackAudioTrackNumber: number | null = null;
  let currentPlaybackSubtitleTrackNumber: number | null = null;
  let currentPlaybackAudioLanguage: string | null = null;
  let currentPlaybackSubtitleLanguage: string | null = null;
  let currentPlaybackIsExternalSubtitle: boolean | null = null;
  let currentPlaybackSubtitlePath: string | null = null;
  let currentPlaybackSubtitleCodec: string | null = null;

  function setPendingPlaybackData(message?: PlayMediaMessage): void {
    if (!message) return;
    if (message.title) {
      currentPlaybackTitle = message.title;
    }
    const streamUrl = message.streamUrl;
    if (streamUrl) {
      const match = (String(streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1];
      if (match) {
        currentPlaybackItemId = match;
      }
    }
    const startPositionTicks = message.startPositionTicks as number | undefined;
    const startPositionSeconds =
      typeof startPositionTicks === "number" && startPositionTicks > 0
        ? ticksToSeconds(startPositionTicks)
        : (message.startPositionSeconds as number | undefined);
    if (typeof startPositionSeconds === "number") {
      currentPlaybackStartPositionSeconds = startPositionSeconds;
    }
    if (typeof message.selectedAudioIndex === "number") {
      currentPlaybackAudioIndex = message.selectedAudioIndex;
    }
    if (typeof message.selectedSubtitleIndex === "number") {
      currentPlaybackSubtitleIndex = message.selectedSubtitleIndex;
    }
    if (typeof message.audioTrackNumber === "number") {
      currentPlaybackAudioTrackNumber = message.audioTrackNumber;
    }
    if (typeof message.subtitleTrackNumber === "number") {
      currentPlaybackSubtitleTrackNumber = message.subtitleTrackNumber;
    }
    if (typeof message.audioLanguage === "string") {
      currentPlaybackAudioLanguage = message.audioLanguage;
    }
    if (typeof message.subtitleLanguage === "string") {
      currentPlaybackSubtitleLanguage = message.subtitleLanguage;
    }
    if (typeof message.isExternalSubtitle === "boolean") {
      currentPlaybackIsExternalSubtitle = message.isExternalSubtitle;
    }
    if (typeof message.subtitlePath === "string") {
      currentPlaybackSubtitlePath = message.subtitlePath;
    }
    if (typeof message.subtitleCodec === "string") {
      currentPlaybackSubtitleCodec = message.subtitleCodec;
    }
  }

  function getPendingMediaTitle(itemId?: string): string | null {
    if (!currentPlaybackTitle) return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackTitle;
  }

  function getPendingStartPosition(itemId?: string): number | null {
    if (typeof currentPlaybackStartPositionSeconds !== "number") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackStartPositionSeconds;
  }

  function getPendingAudioIndex(itemId?: string): number | null {
    if (typeof currentPlaybackAudioIndex !== "number") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackAudioIndex;
  }

  function getPendingSubtitleIndex(itemId?: string): number | null {
    if (typeof currentPlaybackSubtitleIndex !== "number") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackSubtitleIndex;
  }

  function getPendingAudioTrackNumber(itemId?: string): number | null {
    if (typeof currentPlaybackAudioTrackNumber !== "number") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackAudioTrackNumber;
  }

  function getPendingSubtitleTrackNumber(itemId?: string): number | null {
    if (typeof currentPlaybackSubtitleTrackNumber !== "number") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackSubtitleTrackNumber;
  }

  function getPendingAudioLanguage(itemId?: string): string | null {
    if (!currentPlaybackAudioLanguage) return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackAudioLanguage;
  }

  function getPendingSubtitleLanguage(itemId?: string): string | null {
    if (!currentPlaybackSubtitleLanguage) return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackSubtitleLanguage;
  }

  function getPendingIsExternalSubtitle(itemId?: string): boolean | null {
    if (typeof currentPlaybackIsExternalSubtitle !== "boolean") return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackIsExternalSubtitle;
  }

  function getPendingSubtitlePath(itemId?: string): string | null {
    if (!currentPlaybackSubtitlePath) return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackSubtitlePath;
  }

  function getPendingSubtitleCodec(itemId?: string): string | null {
    if (!currentPlaybackSubtitleCodec) return null;
    if (itemId && currentPlaybackItemId && currentPlaybackItemId !== itemId) {
      return null;
    }
    return currentPlaybackSubtitleCodec;
  }

  function markReplacingPlayback(): void {
    replacingPlaybackAt = Date.now();
  }

  function consumeReplacementGuard(): boolean {
    if (!replacingPlaybackAt) {
      return false;
    }

    const age = Date.now() - replacingPlaybackAt;
    replacingPlaybackAt = 0;

    if (age > REPLACEMENT_GUARD_MS) {
      log(`Ignoring replacement guard set ${age}ms ago (expired)`);
      return false;
    }

    return true;
  }

  // Tracks whether current playback was launched from the Emby browser
  // (standalone window or sidebar) so the browser can be reopened when finished.
  let launchedFromBrowser = false;

  function markLaunchedFromBrowser(): void {
    launchedFromBrowser = true;
  }

  function clearLaunchedFromBrowser(): void {
    launchedFromBrowser = false;
  }

  function consumeLaunchedFromBrowser(): boolean {
    const wasLaunched = launchedFromBrowser;
    launchedFromBrowser = false;
    return wasLaunched;
  }

  /**
   * Open media in a new IINA instance
   */
  function openInNewInstance(playData: PlayMediaMessage): void {
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      log("Requesting new player instance from global entry");
      iinaGlobal.postMessage("create-player", playData);
    } else {
      log("Global entry not available, opening in current window");
      openInCurrentWindow(playData.streamUrl, playData.title, playData.startPositionSeconds);
    }
  }

  /**
   * Open media in the current window, replacing what is playing
   */
  function openInCurrentWindow(streamUrl: string, title?: string, startPositionSeconds?: number): void {
    log("Opening media in current window: " + streamUrl);
    markLaunchedFromBrowser();

    currentPlaybackTitle = title || null;
    currentPlaybackItemId = (String(streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1] || null;
    currentPlaybackStartPositionSeconds = typeof startPositionSeconds === "number" ? startPositionSeconds : null;

    // Set replacement guard so end-file handler doesn't send spurious stop
    if (getCurrentPlaybackSession()) {
      markReplacingPlayback();
    }

    // Clear any previous playlist entries to prevent stale titles. IINA's
    // playlist API has no clear(), so use mpv's own command — it drops every
    // entry except the one currently playing, which core.open replaces below.
    try {
      const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
      if (playlistCount > 1) {
        mpv.command("playlist-clear", []);
      }
      // Reset autoplay state when starting new playback
      clearQueuedFlag();
    } catch (clearError: unknown) {
      const errorMsg = clearError instanceof Error ? clearError.message : String(clearError);
      log(`Could not clear playlist before opening: ${errorMsg}`);
    }

    // We use core.open instead of mpv.command('loadfile') because core.open
    // properly triggers IINA's native lifecycle and sleep prevention checks.
    // Set force-media-title BEFORE core.open so mpv uses it when loadfile runs.
    if (title) {
      try {
        mpv.set("force-media-title", title);
      } catch {
        // Ignore
      }
      try {
        mpv.set("title", title);
      } catch {
        // Ignore
      }
    }

    if (typeof startPositionSeconds === "number" && startPositionSeconds > 0) {
      log(`Setting initial start position to ${startPositionSeconds}s`);
      try {
        mpv.set("start", `${startPositionSeconds}`);
      } catch (err: unknown) {
        log(`Could not set mpv start position: ${String(err)}`);
      }
    }

    core.open(streamUrl);
  }

  // Items waiting to join the playlist behind the one currently being opened.
  let pendingPlaylistQueue: PendingPlaylistQueue | null = null;

  /**
   * Append the items held back by handlePlayMediaList. Called once the first item
   * of the list has actually loaded, so mpv's replacing load cannot discard them.
   */
  function flushPendingPlaylistQueue(fileUrl?: string): void {
    if (!pendingPlaylistQueue) {
      return;
    }

    const { items, at, itemId } = pendingPlaylistQueue;
    pendingPlaylistQueue = null;

    if (Date.now() - at > PENDING_QUEUE_TTL_MS) {
      log("Queued playlist items are stale, not appending them");
      return;
    }

    // Make sure this is the file the list started with. IINA percent-encodes the
    // URL, so compare on the item id rather than the whole string.
    if (itemId && fileUrl && !String(fileUrl).includes(itemId)) {
      log(`Loaded file is not the queued list's first item (${itemId}), dropping the queue`);
      return;
    }

    try {
      if (file && utils && typeof file.write === "function") {
        let m3uContent = "#EXTM3U\n";
        for (const item of items) {
          const title = (item.title || "Episode").replace(/[\r\n]+/g, " ");
          m3uContent += `#EXTINF:-1,${title}\n${item.streamUrl}\n`;
        }
        const m3uPath = utils.resolvePath("@data/playlist_queue.m3u8");
        file.write(m3uPath, m3uContent);
        log(`Appending ${items.length} queued item(s) via loadlist: ${m3uPath}`);
        mpv.command("loadlist", [m3uPath, "append"]);
      } else {
        for (const item of items) {
          const args: string[] = [item.streamUrl, "append"];
          if (item.title) {
            args.push("-1", `force-media-title=${item.title}`);
          }
          mpv.command("loadfile", args);
        }
      }
      log(`Appended ${items.length} queued item(s) to the playlist`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log("Could not append queued items: " + errorMsg);
    }
  }

  /**
   * Handle a request to play several items in order (e.g. a whole album).
   * A playlist only exists within one window, so this always plays in the
   * current window regardless of the open_in_new_window preference.
   */
  function handlePlayMediaList(message?: PlayMediaListMessage): void {
    const rawItems = message?.items || [];
    const items: PlaylistItem[] = rawItems
      .filter((item): item is PlayMediaMessage & { streamUrl: string } => Boolean(item?.streamUrl))
      .map((item) => ({
        ...item,
        streamUrl: sanitizeStreamUrl(item.streamUrl) || item.streamUrl,
      }));
    log(`handlePlayMediaList called with ${items.length} playable item(s)`);

    if (items.length === 0) {
      log("No playable items in list");
      core.osd("Nothing to play");
      return;
    }

    const [firstItem, ...queuedItems] = items;

    try {
      if (queuedItems.length > 0) {
        core.osd(`Playing ${items.length} tracks, starting with: ${firstItem.title || ""}`);
      } else {
        core.osd(`Opening: ${firstItem.title || ""}`);
      }

      // The rest can only be appended once the first item has loaded.
      const firstItemId = (String(firstItem.streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1] || null;
      pendingPlaylistQueue = queuedItems.length > 0 ? { items: queuedItems, at: Date.now(), itemId: firstItemId } : null;

      markLaunchedFromBrowser();
      openInCurrentWindow(firstItem.streamUrl, firstItem.title);

      log(`Holding ${queuedItems.length} item(s) until the first one loads`);
    } catch (error: unknown) {
      clearLaunchedFromBrowser();
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Error playing media list: " + errorMsg);
      core.osd("Failed to play tracks");
    }
  }

  /**
   * Handle media playback requests from sidebar
   */
  function handlePlayMedia(message?: PlayMediaMessage): void {
    log("HANDLE PLAY MEDIA CALLED");
    log("handlePlayMedia called with message", {
      title: message?.title,
      streamUrl: message?.streamUrl,
      selectedAudioIndex: message?.selectedAudioIndex,
      selectedSubtitleIndex: message?.selectedSubtitleIndex,
      audioTrackNumber: message?.audioTrackNumber,
      subtitleTrackNumber: message?.subtitleTrackNumber,
    });
    const streamUrl = sanitizeStreamUrl(message?.streamUrl);
    const title = message?.title;

    if (!streamUrl) {
      log("handlePlayMedia called without streamUrl");
      return;
    }

    log(`Opening media: ${title} - ${streamUrl}`);
    setPendingPlaybackData({ ...message, streamUrl });

    const startPositionTicks = message?.startPositionTicks as number | undefined;
    const startPositionSeconds =
      typeof startPositionTicks === "number" && startPositionTicks > 0
        ? ticksToSeconds(startPositionTicks)
        : (message?.startPositionSeconds as number | undefined);

    try {
      markLaunchedFromBrowser();
      const openInNewWindow = preferences.get("open_in_new_window");
      log("open_in_new_window preference: " + openInNewWindow);

      if (openInNewWindow) {
        log("Opening media in new instance: " + streamUrl);
        core.osd(`Opening in new window: ${title || ""}`);
        openInNewInstance({ ...message, streamUrl, title, startPositionSeconds });
      } else {
        core.osd(`Opening: ${title || ""}`);
        openInCurrentWindow(streamUrl, title, startPositionSeconds);
      }

      log("Successfully initiated media opening: " + streamUrl);
    } catch (error: unknown) {
      clearLaunchedFromBrowser();
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Error opening media: " + errorMsg);
      core.osd("Failed to open media");

      // No clipboard API is exposed to plugins, so the URL only goes to the log
      log.error(`URL that failed to open: ${streamUrl}`);
    }
  }

  // Register replies from the global entry if available
  if (iinaGlobal && typeof iinaGlobal.onMessage === "function") {
    iinaGlobal.onMessage("player-created", (data: GlobalPlayerCreatedMessage) => {
      log("New player instance created", {
        playerId: data?.playerId,
        title: data?.title,
        url: data?.url,
      });
      if (data?.title) {
        core.osd(`Opened in new window: ${data.title}`);
      }
    });

    iinaGlobal.onMessage("player-creation-failed", (data: GlobalPlayerFailedMessage) => {
      log.error("Failed to create new player instance: " + (data?.error || ""));
      core.osd("Failed to open new window - opening in current window");
      if (data?.url) {
        core.open(data.url);
      }
    });
  }

  return {
    markReplacingPlayback,
    consumeReplacementGuard,
    markLaunchedFromBrowser,
    clearLaunchedFromBrowser,
    consumeLaunchedFromBrowser,
    openInNewInstance,
    openInCurrentWindow,
    flushPendingPlaylistQueue,
    handlePlayMediaList,
    handlePlayMedia,
    setPendingPlaybackData,
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
  };
}
