import { ticksToSeconds } from "./time";

export interface EmbyChapterInput {
  StartPositionTicks?: number;
  Name?: string;
  MarkerType?: string;
  ChapterType?: string;
  [key: string]: unknown;
}

export interface MpvChapterInput {
  title?: string;
  time?: number;
  [key: string]: unknown;
}

export interface FindOutroOptions {
  chapters?: EmbyChapterInput[] | null;
  mpvChapters?: MpvChapterInput[] | null;
  duration?: number | null;
}

export interface OutroSegment {
  startSeconds: number;
  endSeconds?: number;
  title?: string;
  source: "emby-marker" | "emby-chapter" | "mpv-chapter";
  hasNextChapter: boolean;
  nextChapterStartTime?: number;
}

export const OUTRO_TITLE_PATTERN =
  /(?:^|[\s_\-–—([#])(?:credits?|end(?:ing)?(?:\s*credits?)?|outro|closing|\bed(?:\s*\d+)?)(?:[\s_\-–—)\]#\d]|$)|(?:片尾|片尾曲|片尾字幕|结尾|演职员表|演职人员|エンディング|エンドクレジット|クレジット)/i;

export const POST_CREDITS_PATTERN = /(?:post|after|mid)[-\s]*credits?|彩蛋/i;

/**
 * Checks whether an explicit marker type indicates an outro/credits segment.
 */
export function isOutroMarker(markerType?: string, chapterType?: string): boolean {
  if (!markerType && !chapterType) return false;
  const mt = String(markerType || "")
    .trim()
    .toLowerCase();
  const ct = String(chapterType || "")
    .trim()
    .toLowerCase();
  return mt === "creditsstart" || mt === "outrostart" || mt === "credits" || mt === "outro" || ct === "credits" || ct === "outro";
}

/**
 * Checks whether a chapter name matches common outro/credits titles.
 */
export function isOutroTitle(title?: string): boolean {
  if (!title || typeof title !== "string") return false;
  const trimmed = title.trim();
  if (!trimmed) return false;
  if (POST_CREDITS_PATTERN.test(trimmed)) return false;
  return OUTRO_TITLE_PATTERN.test(trimmed);
}

/**
 * Validates whether the start position of a candidate outro is reasonably located in the video.
 * For title-based matches without an explicit MarkerType, the segment should not appear early in the media.
 */
export function isOutroPosition(startSeconds: number, duration?: number | null): boolean {
  if (startSeconds <= 0) return false;
  if (typeof duration === "number" && duration > 0) {
    return startSeconds >= duration * 0.5;
  }
  return startSeconds >= 60;
}

/**
 * Detects an outro / end credits segment from Emby metadata chapters or MPV internal chapters.
 */
export function findOutroSegment(options: FindOutroOptions): OutroSegment | null {
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
      .filter((ch) => ch.startSeconds > 0)
      .sort((a, b) => a.startSeconds - b.startSeconds);

    // 1a. Priority 1: Explicit Emby MarkerType (e.g. CreditsStart / OutroStart)
    const markerIndex = validChapters.findIndex((ch) => isOutroMarker(ch.markerType, ch.chapterType));
    if (markerIndex !== -1) {
      const match = validChapters[markerIndex];
      const nextChapter = validChapters[markerIndex + 1];
      const isNextAlsoOutro =
        nextChapter && (isOutroMarker(nextChapter.markerType, nextChapter.chapterType) || isOutroTitle(nextChapter.name));
      const hasNextChapter = Boolean(nextChapter && !isNextAlsoOutro);
      const nextChapterStartTime = hasNextChapter ? nextChapter.startSeconds : undefined;
      const endSeconds = hasNextChapter ? nextChapterStartTime : typeof duration === "number" && duration > 0 ? duration : undefined;

      return {
        startSeconds: match.startSeconds,
        endSeconds,
        title: match.name || "Credits",
        source: "emby-marker",
        hasNextChapter,
        nextChapterStartTime,
      };
    }

    // 1b. Priority 2: Emby Chapter Name Matching Outro Keywords
    const titleIndex = validChapters.findIndex((ch) => isOutroTitle(ch.name) && isOutroPosition(ch.startSeconds, duration));
    if (titleIndex !== -1) {
      const match = validChapters[titleIndex];
      const nextChapter = validChapters[titleIndex + 1];
      const isNextAlsoOutro = nextChapter && isOutroTitle(nextChapter.name);
      const hasNextChapter = Boolean(nextChapter && !isNextAlsoOutro);
      const nextChapterStartTime = hasNextChapter ? nextChapter.startSeconds : undefined;
      const endSeconds = hasNextChapter ? nextChapterStartTime : typeof duration === "number" && duration > 0 ? duration : undefined;

      return {
        startSeconds: match.startSeconds,
        endSeconds,
        title: match.name || "Outro",
        source: "emby-chapter",
        hasNextChapter,
        nextChapterStartTime,
      };
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
      .filter((ch) => ch.startSeconds > 0)
      .sort((a, b) => a.startSeconds - b.startSeconds);

    const mpvIndex = validMpv.findIndex((ch) => isOutroTitle(ch.name) && isOutroPosition(ch.startSeconds, duration));
    if (mpvIndex !== -1) {
      const match = validMpv[mpvIndex];
      const nextChapter = validMpv[mpvIndex + 1];
      const isNextAlsoOutro = nextChapter && isOutroTitle(nextChapter.name);
      const hasNextChapter = Boolean(nextChapter && !isNextAlsoOutro);
      const nextChapterStartTime = hasNextChapter ? nextChapter.startSeconds : undefined;
      const endSeconds = hasNextChapter ? nextChapterStartTime : typeof duration === "number" && duration > 0 ? duration : undefined;

      return {
        startSeconds: match.startSeconds,
        endSeconds,
        title: match.name || "Outro",
        source: "mpv-chapter",
        hasNextChapter,
        nextChapterStartTime,
      };
    }
  }

  return null;
}
