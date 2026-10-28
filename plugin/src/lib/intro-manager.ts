import { type EmbyChapterInfo, findIntroSegment, type IntroSegment, type MpvChapterInput } from "@shared";
import type { DebugLogger } from "./debug-log";

export interface IntroManagerDeps {
  core: typeof iina.core;
  mpv: typeof iina.mpv;
  preferences: typeof iina.preferences;
  log: DebugLogger;
}

export function createIntroManager({ core, mpv, preferences, log }: IntroManagerDeps) {
  let currentIntroSegment: IntroSegment | null = null;
  let hasSkippedIntro = false;
  let currentItemId: string | null = null;
  let cachedMetadataChapters: EmbyChapterInfo[] = [];

  function setSession(itemId: string): void {
    currentItemId = itemId;
  }

  function resetForNewFile(): void {
    currentIntroSegment = null;
    hasSkippedIntro = false;
    currentItemId = null;
    cachedMetadataChapters = [];
  }

  function updateMetadataChapters(chapters?: EmbyChapterInfo[], duration?: number): void {
    if (Array.isArray(chapters) && chapters.length > 0) {
      cachedMetadataChapters = chapters;
    }

    const effectiveDuration =
      typeof duration === "number" && duration > 0 ? duration : core.status?.duration || mpv.getNumber("duration") || undefined;

    const detected = findIntroSegment({
      chapters: cachedMetadataChapters,
      duration: effectiveDuration,
    });

    if (detected) {
      currentIntroSegment = detected;
      log(
        `[Intro] Intro segment detected from Emby chapters for ${currentItemId}: start=${detected.startSeconds}s, end=${detected.endSeconds}s, title="${detected.title}", source=${detected.source}`,
      );
    }
  }

  function checkMpvChapters(): void {
    if (currentIntroSegment && currentIntroSegment.source === "emby-marker") {
      return;
    }

    try {
      const rawChapters = mpv.getNative<MpvChapterInput[]>("chapter-list");
      if (!Array.isArray(rawChapters) || rawChapters.length === 0) {
        return;
      }

      const effectiveDuration = core.status?.duration || mpv.getNumber("duration") || undefined;

      const detected = findIntroSegment({
        chapters: cachedMetadataChapters.length > 0 ? cachedMetadataChapters : null,
        mpvChapters: rawChapters,
        duration: effectiveDuration,
      });

      if (detected) {
        currentIntroSegment = detected;
        log(
          `[Intro] Intro segment updated from MPV chapter list for ${currentItemId}: start=${detected.startSeconds}s, end=${detected.endSeconds}s, title="${detected.title}", source=${detected.source}`,
        );
      }
    } catch (err) {
      log("[Intro] Error inspecting mpv chapter-list:", err);
    }
  }

  function executeSkip(source: "auto" | "manual"): boolean {
    if (!currentIntroSegment) {
      log(`[Intro] Skip requested (${source}) but no intro segment is detected`);
      return false;
    }

    hasSkippedIntro = true;
    const targetPos = currentIntroSegment.endSeconds;
    log(`[Intro] Executing skip intro (${source}) for item ${currentItemId}: seeking to ${targetPos}s`);

    try {
      core.seekTo(targetPos);
    } catch {
      try {
        mpv.set("time-pos", targetPos);
      } catch (err) {
        log("[Intro] Failed to seek to end of intro:", err);
      }
    }

    if (preferences.get("show_notifications") !== false) {
      core.osd("已跳过片头");
    }

    return true;
  }

  function checkAndTriggerSkip(timePos: number): boolean {
    if (!currentIntroSegment) {
      return false;
    }

    // Allow user to rewind back before intro to re-arm the trigger
    if (hasSkippedIntro && timePos < currentIntroSegment.startSeconds - 5) {
      log(`[Intro] Position (${timePos}s) rewound before intro start (${currentIntroSegment.startSeconds}s). Re-arming skip trigger.`);
      hasSkippedIntro = false;
      return false;
    }

    if (hasSkippedIntro) {
      return false;
    }

    const isAutoSkipEnabled = preferences.get("auto_skip_intro") !== false;
    if (!isAutoSkipEnabled) {
      return false;
    }

    // Trigger skip if within intro bounds
    if (timePos >= currentIntroSegment.startSeconds && timePos < currentIntroSegment.endSeconds) {
      log(
        `[Intro] checkAndTriggerSkip: pos=${timePos}s in intro range [${currentIntroSegment.startSeconds}s, ${currentIntroSegment.endSeconds}s], triggering skip`,
      );
      return executeSkip("auto");
    }

    return false;
  }

  function manualSkipIntro(): boolean {
    if (!currentIntroSegment) {
      core.osd("未检测到片头");
      return false;
    }
    return executeSkip("manual");
  }

  return {
    setSession,
    resetForNewFile,
    updateMetadataChapters,
    checkMpvChapters,
    checkAndTriggerSkip,
    manualSkipIntro,
    getCurrentIntroSegment: () => currentIntroSegment,
    hasSkipped: () => hasSkippedIntro,
  };
}
