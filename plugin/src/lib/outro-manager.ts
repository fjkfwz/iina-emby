import { type EmbyChapterInfo, findOutroSegment, type MpvChapterInput, type OutroSegment } from "@shared";
import type { DebugLogger } from "./debug-log";

export interface OutroManagerDeps {
  core: typeof iina.core;
  mpv: typeof iina.mpv;
  preferences: typeof iina.preferences;
  markReplacingPlayback: () => void;
  markAsWatched: (serverBase: string, itemId: string, apiKey: string) => Promise<boolean>;
  log: DebugLogger;
}

export function createOutroManager({ core, mpv, preferences, markReplacingPlayback, markAsWatched, log }: OutroManagerDeps) {
  let currentOutroSegment: OutroSegment | null = null;
  let hasSkippedOutro = false;
  let currentServerBase: string | null = null;
  let currentItemId: string | null = null;
  let currentApiKey: string | null = null;
  let cachedMetadataChapters: EmbyChapterInfo[] = [];

  function setSession(serverBase: string, itemId: string, apiKey: string): void {
    currentServerBase = serverBase;
    currentItemId = itemId;
    currentApiKey = apiKey;
  }

  function resetForNewFile(): void {
    currentOutroSegment = null;
    hasSkippedOutro = false;
    currentServerBase = null;
    currentItemId = null;
    currentApiKey = null;
    cachedMetadataChapters = [];
  }

  function updateMetadataChapters(chapters?: EmbyChapterInfo[], duration?: number): void {
    if (Array.isArray(chapters) && chapters.length > 0) {
      cachedMetadataChapters = chapters;
    }

    const effectiveDuration =
      typeof duration === "number" && duration > 0 ? duration : core.status?.duration || mpv.getNumber("duration") || undefined;

    const detected = findOutroSegment({
      chapters: cachedMetadataChapters,
      duration: effectiveDuration,
    });

    if (detected) {
      currentOutroSegment = detected;
      log(
        `[Outro] Outro segment detected from Emby chapters for ${currentItemId}: start=${detected.startSeconds}s, end=${detected.endSeconds ?? "end"}s, title="${detected.title}", hasNext=${detected.hasNextChapter}`,
      );
    }
  }

  function checkMpvChapters(): void {
    if (currentOutroSegment && currentOutroSegment.source === "emby-marker") {
      return;
    }

    try {
      const rawChapters = mpv.getNative<MpvChapterInput[]>("chapter-list");
      if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
        return;
      }

      const effectiveDuration = core.status?.duration || mpv.getNumber("duration") || undefined;

      const detected = findOutroSegment({
        chapters: cachedMetadataChapters.length > 0 ? cachedMetadataChapters : null,
        mpvChapters: rawChapters,
        duration: effectiveDuration,
      });

      if (detected) {
        currentOutroSegment = detected;
        log(
          `[Outro] Outro segment updated from MPV chapter list for ${currentItemId}: start=${detected.startSeconds}s, end=${detected.endSeconds ?? "end"}s, source=${detected.source}`,
        );
      }
    } catch (err) {
      log("[Outro] Error inspecting mpv chapter-list:", err);
    }
  }

  function executeSkip(source: "auto" | "manual"): boolean {
    hasSkippedOutro = true;
    log(`[Outro] Executing skip outro (${source}) for item ${currentItemId}`);

    // 1. Report as watched to Emby
    if (currentServerBase && currentItemId && currentApiKey) {
      try {
        markAsWatched(currentServerBase, currentItemId, currentApiKey).catch((err) => {
          log("[Outro] Error marking as watched on outro skip:", err);
        });
      } catch (err) {
        log("[Outro] Error invoking markAsWatched:", err);
      }
    }

    // 2. Show notification
    if (preferences.get("show_notifications")) {
      core.osd("已跳过片尾");
    }

    // 3. Determine skip destination
    let hasNextInPlaylist = false;
    try {
      const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
      const currentPos = Number(mpv.getNumber("playlist-pos") || 0);
      hasNextInPlaylist = playlistCount > 0 && currentPos < playlistCount - 1;
    } catch {
      // Ignore
    }

    if (hasNextInPlaylist) {
      log("[Outro] Advancing to next episode via playlist-next");
      markReplacingPlayback();
      try {
        mpv.command("playlist-next", []);
      } catch (err) {
        log("[Outro] Failed to advance to next playlist item:", err);
      }
      return true;
    }

    if (currentOutroSegment?.hasNextChapter && typeof currentOutroSegment.nextChapterStartTime === "number") {
      const targetPos = currentOutroSegment.nextChapterStartTime;
      log(`[Outro] Skipping outro to post-credits chapter at ${targetPos}s`);
      try {
        core.seekTo(targetPos);
      } catch {
        try {
          mpv.set("time-pos", targetPos);
        } catch (err) {
          log("[Outro] Failed to seek to next chapter:", err);
        }
      }
      return true;
    }

    const duration = core.status?.duration || mpv.getNumber("duration") || 0;
    if (duration > 0) {
      const targetPos = Math.max(0, duration - 0.2);
      log(`[Outro] End of playlist reached, seeking to end of file (${targetPos}s) to trigger completion`);
      try {
        core.seekTo(targetPos);
      } catch {
        try {
          mpv.set("time-pos", targetPos);
        } catch (err) {
          log("[Outro] Failed to seek to end of file:", err);
        }
      }
      return true;
    }

    return true;
  }

  function checkAndTriggerSkip(currentPosition: number): boolean {
    if (!currentOutroSegment) {
      return false;
    }

    if (hasSkippedOutro) {
      // If user deliberately seeks back before the outro starts, reset the flag so they can trigger again
      if (currentPosition < currentOutroSegment.startSeconds - 5) {
        hasSkippedOutro = false;
        log(
          `[Outro] Playback position rewound (${currentPosition.toFixed(1)}s < ${currentOutroSegment.startSeconds}s), reset hasSkippedOutro`,
        );
      }
      return false;
    }

    if (preferences.get("auto_skip_outro") === false) {
      return false;
    }

    // Trigger when playback position enters the outro
    if (currentPosition >= currentOutroSegment.startSeconds - 0.3) {
      if (currentOutroSegment.endSeconds && currentPosition >= currentOutroSegment.endSeconds) {
        return false;
      }

      return executeSkip("auto");
    }

    return false;
  }

  function manualSkipOutro(): void {
    log(`[Outro] Manual skip requested by user for item ${currentItemId}`);
    executeSkip("manual");
  }

  function getCurrentOutroSegment(): OutroSegment | null {
    return currentOutroSegment;
  }

  function hasSkipped(): boolean {
    return hasSkippedOutro;
  }

  return {
    setSession,
    resetForNewFile,
    updateMetadataChapters,
    checkMpvChapters,
    checkAndTriggerSkip,
    manualSkipOutro,
    getCurrentOutroSegment,
    hasSkipped,
  };
}
