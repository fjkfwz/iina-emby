import type { EmbyChapterInput, MpvChapterInput } from "./outro";
import { ticksToSeconds } from "./time";

export interface FindIntroOptions {
  chapters?: EmbyChapterInput[] | null;
  mpvChapters?: MpvChapterInput[] | null;
  duration?: number | null;
}

export interface IntroSegment {
  startSeconds: number;
  endSeconds: number;
  title?: string;
  source: "emby-marker" | "emby-chapter" | "mpv-chapter";
}

export const INTRO_TITLE_PATTERN =
  /(?:^|[\s_\-–—([#])(?:intro(?:duction)?|open(?:ing)?|\bop(?:\s*\d+)?)(?:[\s_\-–—)\]#\d]|$)|(?:片头|片头曲|片头动画|开头|オープニング)/i;

/**
 * Checks whether an explicit marker indicates the start of an intro.
 */
export function isIntroStartMarker(markerType?: string, chapterType?: string): boolean {
  if (!markerType && !chapterType) return false;
  const mt = String(markerType || "")
    .trim()
    .toLowerCase();
  const ct = String(chapterType || "")
    .trim()
    .toLowerCase();
  return mt === "introstart" || mt === "intro" || ct === "intro";
}

/**
 * Checks whether an explicit marker indicates the end of an intro.
 */
export function isIntroEndMarker(markerType?: string, chapterType?: string): boolean {
  if (!markerType && !chapterType) return false;
  const mt = String(markerType || "")
    .trim()
    .toLowerCase();
  const ct = String(chapterType || "")
    .trim()
    .toLowerCase();
  return mt === "introend" || ct === "introend";
}

/**
 * Checks whether a chapter name matches common intro/opening titles.
 */
export function isIntroTitle(title?: string): boolean {
  if (!title || typeof title !== "string") return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  return INTRO_TITLE_PATTERN.test(trimmed);
}

/**
 * Validates whether the candidate intro start position is reasonably located in the first half of the media.
 */
export function isIntroPosition(startSeconds: number, duration?: number | null): boolean {
  if (startSeconds < 0) return false;
  if (typeof duration === "number" && duration > 0) {
    return startSeconds <= duration * 0.5;
  }
  // If duration is unknown, intro should typically start within first 15 minutes (900s)
  return startSeconds <= 900;
}

/**
 * Detects an intro / opening segment from Emby metadata chapters or MPV internal chapters.
 */
export function findIntroSegment(options: FindIntroOptions): IntroSegment | null {
  const { chapters, mpvChapters, duration } = options;

  // 1. Check Emby Chapters
  if (Array.isArray(chapters) && chapters.length > 0) {
    const validChapters = chapters
      .map((ch, idx) => {
        const startSeconds = typeof ch.StartPositionTicks === "number" ? ticksToSeconds(ch.StartPositionTicks) : 0;
        return {
          index: idx,
          startSeconds,
          name: ch.Name,
          markerType: ch.MarkerType,
          chapterType: ch.ChapterType,
        };
      })
      .filter((ch) => ch.startSeconds >= 0)
      .sort((a, b) => a.startSeconds - b.startSeconds);

    // 1a. Priority 1: Explicit Emby MarkerType (e.g. IntroStart / Intro)
    const markerIndex = validChapters.findIndex((ch) => isIntroStartMarker(ch.markerType, ch.chapterType));
    if (markerIndex !== -1) {
      const match = validChapters[markerIndex];
      // Check if there is an explicit IntroEnd marker anywhere after
      const endMarker = validChapters.slice(markerIndex + 1).find((ch) => isIntroEndMarker(ch.markerType, ch.chapterType));
      const nextChapter = validChapters[markerIndex + 1];

      const endSeconds = endMarker ? endMarker.startSeconds : nextChapter ? nextChapter.startSeconds : undefined;

      if (typeof endSeconds === "number" && endSeconds > match.startSeconds) {
        return {
          startSeconds: match.startSeconds,
          endSeconds,
          title: match.name || "Intro",
          source: "emby-marker",
        };
      }
    }

    // 1b. Priority 2: Emby Chapter Name Matching Intro Keywords
    const titleIndex = validChapters.findIndex((ch) => isIntroTitle(ch.name) && isIntroPosition(ch.startSeconds, duration));
    if (titleIndex !== -1) {
      const match = validChapters[titleIndex];
      const nextChapter = validChapters[titleIndex + 1];
      const endSeconds = nextChapter ? nextChapter.startSeconds : undefined;

      if (typeof endSeconds === "number" && endSeconds > match.startSeconds) {
        return {
          startSeconds: match.startSeconds,
          endSeconds,
          title: match.name || "Intro",
          source: "emby-chapter",
        };
      }
    }
  }

  // 2. Check MPV Chapters
  if (Array.isArray(mpvChapters) && mpvChapters.length > 0) {
    const validMpv = mpvChapters
      .map((ch, idx) => ({
        index: idx,
        startSeconds: typeof ch.time === "number" ? ch.time : 0,
        name: ch.title,
      }))
      .filter((ch) => ch.startSeconds >= 0)
      .sort((a, b) => a.startSeconds - b.startSeconds);

    const mpvIndex = validMpv.findIndex((ch) => isIntroTitle(ch.name) && isIntroPosition(ch.startSeconds, duration));
    if (mpvIndex !== -1) {
      const match = validMpv[mpvIndex];
      const nextChapter = validMpv[mpvIndex + 1];
      const endSeconds = nextChapter ? nextChapter.startSeconds : undefined;

      if (typeof endSeconds === "number" && endSeconds > match.startSeconds) {
        return {
          startSeconds: match.startSeconds,
          endSeconds,
          title: match.name || "Intro",
          source: "mpv-chapter",
        };
      }
    }
  }

  return null;
}
