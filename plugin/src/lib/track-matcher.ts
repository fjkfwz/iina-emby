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
  embyStreams?: LightEmbyStream[] | null;
}

export interface AudioMatchCriteria {
  trackNumber?: number | null; // 1-based relative index among audio tracks
  streamIndex?: number | null; // Container stream index / ff-index
  language?: string | null;    // e.g. "eng", "chi"
  title?: string | null;
  channels?: number | null;
  channelLayout?: string | null;
  embyStreams?: LightEmbyStream[] | null;
}

const LANGUAGE_CANONICAL_MAP: Record<string, string> = {
  // Chinese
  chi: "zh",
  zho: "zh",
  zh: "zh",
  chs: "zh",
  cht: "zh",
  sc: "zh",
  tc: "zh",
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

    // 0. Emby stream direct relative index match
    if (typeof streamIndex === "number" && Array.isArray(criteria.embyStreams) && criteria.embyStreams.length > 0) {
      const candidateSubs = criteria.embyStreams.filter((s) => s.Type?.toLowerCase() === "subtitle" && !s.IsExternal);
      const targetSubIdx = candidateSubs.findIndex((s) => s.Index === streamIndex);
      if (targetSubIdx !== -1 && targetSubIdx === i) {
        score += 200;
      }
    }

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
      const cleanTargetTitle = title.replace(/^\[外挂\]\s*/, "").trim().toLowerCase();
      const cleanTrackTitle = track.title.replace(/^\[外挂\]\s*/, "").trim().toLowerCase();
      if (!cleanTrackTitle.includes("no title") && !cleanTargetTitle.includes("no title")) {
        if (cleanTrackTitle === cleanTargetTitle) {
          score += 40;
        } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
          score += 25;
        }
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

    // 0. Emby stream direct relative index match
    if (typeof streamIndex === "number" && Array.isArray(criteria.embyStreams) && criteria.embyStreams.length > 0) {
      const candidateAudio = criteria.embyStreams.filter((s) => s.Type?.toLowerCase() === "audio");
      const targetAudioIdx = candidateAudio.findIndex((s) => s.Index === streamIndex);
      if (targetAudioIdx !== -1 && targetAudioIdx === i) {
        score += 200;
      }
    }

    if (typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1) {
      score += 100;
    }

    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }

    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
    }

    // Channel layout or channel count match bonus
    if (typeof criteria.channels === "number" && criteria.channels > 0) {
      const trackChannels =
        typeof track["channel-count"] === "number"
          ? track["channel-count"]
          : typeof track.channels === "number"
            ? track.channels
            : typeof track["audio-channels"] === "number"
              ? track["audio-channels"]
              : 0;
      if (trackChannels === criteria.channels) {
        score += 30;
      }
    }
    if (criteria.channelLayout) {
      const layout = criteria.channelLayout.toLowerCase();
      const trackTitle = (track.title || "").toLowerCase();
      if (layout === "surround" && (trackTitle.includes("5.1") || trackTitle.includes("7.1") || trackTitle.includes("atmos"))) {
        score += 30;
      } else if (layout === "stereo" && (trackTitle.includes("stereo") || trackTitle.includes("2.0"))) {
        score += 30;
      }
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

export function parsePreferredList(pref?: string | string[] | null): string[] {
  if (!pref) return [];
  if (Array.isArray(pref)) return pref.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return pref
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Finds the best matching audio track using user's global language and channel preferences.
 */
export function findBestAudioTrackByPreference(
  audioTracks: MpvTrack[],
  preferredLanguages?: string | string[] | null,
  preferredChannel?: string | null,
): MpvTrack | undefined {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return undefined;
  }

  const prefLangs = parsePreferredList(preferredLanguages);
  const channelPref = (preferredChannel || "auto").trim().toLowerCase();

  let bestMatch: MpvTrack | undefined;
  let highestScore = -1;

  for (const track of audioTracks) {
    let score = 0;
    const trackCanon = canonicalizeLanguage(track.lang);
    const trackTitle = (track.title || "").toLowerCase();

    // Channel detection
    const channelCount =
      typeof track["channel-count"] === "number"
        ? track["channel-count"]
        : typeof track.channels === "number"
          ? track.channels
          : typeof track["audio-channels"] === "number"
            ? track["audio-channels"]
            : trackTitle.includes("7.1")
              ? 8
              : trackTitle.includes("5.1")
                ? 6
                : trackTitle.includes("stereo") || trackTitle.includes("2.0")
                  ? 2
                  : 0;

    // 1. Language matching in priority order
    if (prefLangs.length > 0) {
      for (let i = 0; i < prefLangs.length; i++) {
        const pref = prefLangs[i];
        const prefCanon = canonicalizeLanguage(pref);
        if (prefCanon && trackCanon && prefCanon === trackCanon) {
          score += 1000 - i * 50; // Priority according to position in list
          break;
        }
      }
    } else {
      score += 100;
    }

    // 2. Channel preference
    if (channelPref === "surround") {
      if (channelCount >= 6 || trackTitle.includes("5.1") || trackTitle.includes("7.1") || trackTitle.includes("atmos")) {
        score += 60;
      }
    } else if (channelPref === "stereo") {
      if (channelCount === 2 || trackTitle.includes("stereo") || trackTitle.includes("2.0")) {
        score += 60;
      }
    } else {
      // Auto: prefer higher channels slightly
      if (channelCount > 0) {
        score += Math.min(channelCount * 5, 40);
      }
    }

    // 3. Default track flag bonus
    if (track.default) {
      score += 10;
    }

    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }

  return highestScore > 0 ? bestMatch : audioTracks[0];
}

/**
 * Finds the best matching subtitle track using user's global language preferences.
 */
export function findBestSubtitleTrackByPreference(
  subTracks: MpvTrack[],
  preferredLanguages?: string | string[] | null,
): MpvTrack | undefined {
  if (!Array.isArray(subTracks) || subTracks.length === 0) {
    return undefined;
  }

  const prefLangs = parsePreferredList(preferredLanguages);
  if (prefLangs.length === 0) {
    return undefined;
  }

  let bestMatch: MpvTrack | undefined;
  let highestScore = -1;

  for (const track of subTracks) {
    let score = 0;
    const trackCanon = canonicalizeLanguage(track.lang);
    const trackVariant = detectChineseVariant((track.title || "") + " " + (track.lang || ""));

    for (let i = 0; i < prefLangs.length; i++) {
      const pref = prefLangs[i];
      const prefCanon = canonicalizeLanguage(pref);
      const prefVariant = detectChineseVariant(pref);

      if (prefCanon && trackCanon && prefCanon === trackCanon) {
        let matchScore = 1000 - i * 50;

        if (prefCanon === "zh") {
          if (prefVariant !== "unknown" && trackVariant !== "unknown") {
            if (prefVariant === trackVariant) {
              matchScore += 80;
            } else {
              matchScore -= 100; // Prefer matching variant
            }
          }
        }

        score = Math.max(score, matchScore);
      }
    }

    if (score > 0) {
      // Prefer full subtitle over forced commentary/signs unless requested
      if (!track.forced) {
        score += 20;
      }
      if (track.default) {
        score += 10;
      }

      if (score > highestScore) {
        highestScore = score;
        bestMatch = track;
      }
    }
  }

  return highestScore > 0 ? bestMatch : undefined;
}

export interface LightEmbyStream {
  Type?: string;
  Index: number;
  Language?: string;
  Title?: string;
  DisplayTitle?: string;
  Codec?: string;
  Channels?: number;
  ChannelLayout?: string;
  [key: string]: unknown;
}

/**
 * Maps an active mpv track to its Emby container stream index (AudioStreamIndex / SubtitleStreamIndex).
 */
export function findEmbyStreamIndexForMpvTrack(
  mpvTrack: MpvTrack | null | undefined,
  embyStreams?: LightEmbyStream[] | null,
  streamType?: "Audio" | "Subtitle",
): number | null {
  if (!mpvTrack) return null;

  const ffIndex = typeof mpvTrack["ff-index"] === "number" ? mpvTrack["ff-index"] : null;
  const srcId = typeof mpvTrack["src-id"] === "number" ? mpvTrack["src-id"] : null;

  if (Array.isArray(embyStreams) && embyStreams.length > 0) {
    const candidateStreams = streamType
      ? embyStreams.filter((s) => s.Type?.toLowerCase() === streamType.toLowerCase())
      : embyStreams;

    // 1. Direct ff-index match
    if (ffIndex !== null) {
      const found = candidateStreams.find((s) => s.Index === ffIndex);
      if (found) return found.Index;
    }

    // 2. Direct src-id match
    if (srcId !== null) {
      const found = candidateStreams.find((s) => s.Index === srcId);
      if (found) return found.Index;
    }

    // 3. Exact 1-based relative track index match for embedded container streams
    if (typeof mpvTrack.id === "number" && mpvTrack.id > 0) {
      const embeddedCandidates = candidateStreams.filter((s) => !s.IsExternal);
      if (mpvTrack.id <= embeddedCandidates.length) {
        const candidate = embeddedCandidates[mpvTrack.id - 1];
        const trackCanon = canonicalizeLanguage(mpvTrack.lang);
        const candCanon = canonicalizeLanguage(candidate.Language);
        if (!trackCanon || !candCanon || trackCanon === candCanon) {
          return candidate.Index;
        }
      }
    }

    // 4. Metadata matching (language + title)
    const trackCanon = canonicalizeLanguage(mpvTrack.lang);
    const trackTitle = (mpvTrack.title || "").trim().toLowerCase();

    for (const s of candidateStreams) {
      const streamCanon = canonicalizeLanguage(s.Language);
      const streamTitle = (s.DisplayTitle || s.Title || "").trim().toLowerCase();

      if (trackCanon && streamCanon && trackCanon === streamCanon) {
        if (trackTitle && streamTitle && (trackTitle.includes(streamTitle) || streamTitle.includes(trackTitle))) {
          return s.Index;
        }
      }
    }

    // 5. Embedded relative position fallback (mpv.id -> N-th embedded stream)
    if (typeof mpvTrack.id === "number" && mpvTrack.id > 0) {
      const embeddedCandidates = candidateStreams.filter((s) => !s.IsExternal);
      if (mpvTrack.id <= embeddedCandidates.length) {
        return embeddedCandidates[mpvTrack.id - 1].Index;
      }
    }

    // 6. First matching language
    if (trackCanon) {
      const foundLang = candidateStreams.find((s) => canonicalizeLanguage(s.Language) === trackCanon);
      if (foundLang) return foundLang.Index;
    }
  }

  return ffIndex !== null ? ffIndex : srcId !== null ? srcId : typeof mpvTrack.id === "number" ? mpvTrack.id : null;
}

