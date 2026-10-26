export interface MpvTrack {
  id: number;
  type: string;
  "src-id"?: number;
  "ff-index"?: number;
  lang?: string;
  title?: string;
  codec?: string;
  default?: boolean;
  forced?: boolean;
  selected?: boolean;
  [key: string]: unknown;
}

export interface SubtitleMatchCriteria {
  trackNumber?: number | null; // 1-based relative index among subtitle tracks in Emby
  streamIndex?: number | null; // Container stream index / ff-index in Emby
  language?: string | null;    // e.g. "chi", "zh", "eng"
  title?: string | null;       // e.g. "Simplified", "中文 (SRT) - Simplified"
  codec?: string | null;       // e.g. "srt", "subrip"
}

export interface AudioMatchCriteria {
  trackNumber?: number | null; // 1-based relative index among audio tracks
  streamIndex?: number | null; // Container stream index / ff-index
  language?: string | null;    // e.g. "eng", "chi"
  title?: string | null;
}

const LANGUAGE_CANONICAL_MAP: Record<string, string> = {
  // Chinese
  chi: "zh",
  zho: "zh",
  zh: "zh",
  cmn: "zh",
  chinese: "zh",
  中文: "zh",
  汉语: "zh",
  漢語: "zh",
  // English
  eng: "en",
  en: "en",
  english: "en",
  英文: "en",
  英语: "en",
  // Japanese
  jpn: "ja",
  ja: "ja",
  japanese: "ja",
  日文: "ja",
  日语: "ja",
  // Korean
  kor: "ko",
  ko: "ko",
  korean: "ko",
  韩文: "ko",
  韩语: "ko",
  // French
  fre: "fr",
  fra: "fr",
  fr: "fr",
  french: "fr",
  法文: "fr",
  法语: "fr",
  // German
  ger: "de",
  deu: "de",
  de: "de",
  german: "de",
  德文: "de",
  德语: "de",
  // Spanish
  spa: "es",
  es: "es",
  spanish: "es",
  西班牙语: "es",
  // Russian
  rus: "ru",
  ru: "ru",
  russian: "ru",
  俄文: "ru",
  俄语: "ru",
  // Italian
  ita: "it",
  it: "it",
  italian: "it",
  意大利语: "it",
  // Portuguese
  por: "pt",
  pt: "pt",
  portuguese: "pt",
  葡萄牙语: "pt",
  // Vietnamese
  vie: "vi",
  vi: "vi",
  vietnamese: "vi",
  越南语: "vi",
  // Thai
  tha: "th",
  th: "th",
  thai: "th",
  泰文: "th",
  泰语: "th",
  // Arabic
  ara: "ar",
  ar: "ar",
  arabic: "ar",
  阿拉伯语: "ar",
  // Cantonese
  yue: "yue",
  cantonese: "yue",
  粤语: "yue",
  广东话: "yue",
};

export function canonicalizeLanguage(lang?: string | null): string | null {
  if (!lang) return null;
  const clean = lang.trim().toLowerCase();
  if (LANGUAGE_CANONICAL_MAP[clean]) {
    return LANGUAGE_CANONICAL_MAP[clean];
  }
  const prefix = clean.split(/[-_]/)[0];
  if (LANGUAGE_CANONICAL_MAP[prefix]) {
    return LANGUAGE_CANONICAL_MAP[prefix];
  }
  return clean;
}

export type ChineseVariant = "simplified" | "traditional" | "unknown";

export function detectChineseVariant(text?: string | null): ChineseVariant {
  if (!text) return "unknown";
  const clean = text.toLowerCase();
  if (
    clean.includes("simplified") ||
    clean.includes("hans") ||
    clean.includes("chs") ||
    clean.includes("sc") ||
    clean.includes("简体") ||
    clean.includes("简中") ||
    clean.includes("简")
  ) {
    return "simplified";
  }
  if (
    clean.includes("traditional") ||
    clean.includes("hant") ||
    clean.includes("cht") ||
    clean.includes("tc") ||
    clean.includes("繁体") ||
    clean.includes("繁中") ||
    clean.includes("繁")
  ) {
    return "traditional";
  }
  return "unknown";
}

/**
 * Matches an mpv subtitle track from track-list against user-selected criteria from Emby.
 */
export function findMatchingSubtitleTrack(
  subTracks: MpvTrack[],
  criteria: SubtitleMatchCriteria,
): MpvTrack | undefined {
  if (!Array.isArray(subTracks) || subTracks.length === 0) {
    return undefined;
  }

  const { trackNumber, streamIndex, language, title, codec } = criteria;
  const targetCanonLang = canonicalizeLanguage(language);
  const targetVariant = detectChineseVariant((title || "") + " " + (language || ""));

  let bestMatch: MpvTrack | undefined;
  let highestScore = -1;

  for (let i = 0; i < subTracks.length; i++) {
    const track = subTracks[i];
    let score = 0;

    const trackCanonLang = canonicalizeLanguage(track.lang);
    const trackVariant = detectChineseVariant((track.title || "") + " " + (track.lang || ""));

    // 1. Relative track index match (1-based index in subtitle tracks array)
    const isPositionMatch = typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1;
    if (isPositionMatch) {
      score += 100;
    }

    // 2. FFmpeg stream index match
    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }

    // 3. Language and variant match
    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
      if (targetCanonLang === "zh") {
        if (targetVariant !== "unknown" && trackVariant !== "unknown") {
          if (targetVariant === trackVariant) {
            score += 60; // Exact Chinese variant match (Simplified vs Traditional)
          } else {
            score -= 50; // Variant conflict
          }
        }
      }
    }

    // 4. Title match
    if (title && track.title) {
      const cleanTargetTitle = title.trim().toLowerCase();
      const cleanTrackTitle = track.title.trim().toLowerCase();
      if (cleanTrackTitle === cleanTargetTitle) {
        score += 40;
      } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
        score += 25;
      }
    }

    // 5. Codec match
    if (codec && track.codec) {
      const cleanTargetCodec = codec.trim().toLowerCase();
      const cleanTrackCodec = track.codec.trim().toLowerCase();
      if (cleanTrackCodec.includes(cleanTargetCodec) || cleanTargetCodec.includes(cleanTrackCodec)) {
        score += 10;
      }
    }

    // 6. Direct ID match
    if (
      (typeof trackNumber === "number" && track.id === trackNumber) ||
      (typeof streamIndex === "number" && track.id === streamIndex)
    ) {
      score += 15;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }

  // Fallback to relative track number if within range
  if (typeof trackNumber === "number" && trackNumber > 0 && trackNumber <= subTracks.length) {
    return subTracks[trackNumber - 1];
  }

  return undefined;
}

/**
 * Matches an mpv audio track from track-list against user-selected criteria from Emby.
 */
export function findMatchingAudioTrack(
  audioTracks: MpvTrack[],
  criteria: AudioMatchCriteria,
): MpvTrack | undefined {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return undefined;
  }

  const { trackNumber, streamIndex, language, title } = criteria;
  const targetCanonLang = canonicalizeLanguage(language);

  let bestMatch: MpvTrack | undefined;
  let highestScore = -1;

  for (let i = 0; i < audioTracks.length; i++) {
    const track = audioTracks[i];
    let score = 0;

    const trackCanonLang = canonicalizeLanguage(track.lang);

    if (typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1) {
      score += 100;
    }

    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }

    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
    }

    if (title && track.title) {
      const cleanTargetTitle = title.trim().toLowerCase();
      const cleanTrackTitle = track.title.trim().toLowerCase();
      if (cleanTrackTitle === cleanTargetTitle) {
        score += 40;
      } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
        score += 25;
      }
    }

    if (
      (typeof trackNumber === "number" && track.id === trackNumber) ||
      (typeof streamIndex === "number" && track.id === streamIndex)
    ) {
      score += 15;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }

  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }

  if (typeof trackNumber === "number" && trackNumber > 0 && trackNumber <= audioTracks.length) {
    return audioTracks[trackNumber - 1];
  }

  return undefined;
}
