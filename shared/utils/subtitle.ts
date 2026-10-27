export interface SubtitleTrackInfo {
  title: string;
  lang: string;
  fileName: string;
}

export const SUBTITLE_LANG_MAP: Record<string, { lang: string; name: string }> = {
  chi: { lang: "chi", name: "简体中文" },
  zho: { lang: "chi", name: "简体中文" },
  zh: { lang: "chi", name: "简体中文" },
  "zh-cn": { lang: "chi", name: "简体中文" },
  "zh-hans": { lang: "chi", name: "简体中文" },
  chs: { lang: "chi", name: "简体中文" },
  sc: { lang: "chi", name: "简体中文" },
  "zh-tw": { lang: "chi", name: "繁体中文" },
  "zh-hk": { lang: "chi", name: "繁体中文" },
  "zh-hant": { lang: "chi", name: "繁体中文" },
  cht: { lang: "chi", name: "繁体中文" },
  tc: { lang: "chi", name: "繁体中文" },
  eng: { lang: "eng", name: "英语" },
  en: { lang: "eng", name: "英语" },
  jpn: { lang: "jpn", name: "日语" },
  ja: { lang: "jpn", name: "日语" },
  kor: { lang: "kor", name: "韩语" },
  ko: { lang: "kor", name: "韩语" },
  fre: { lang: "fre", name: "法语" },
  fra: { lang: "fre", name: "法语" },
  fr: { lang: "fre", name: "法语" },
  ger: { lang: "ger", name: "德语" },
  deu: { lang: "ger", name: "德语" },
  de: { lang: "ger", name: "德语" },
  spa: { lang: "spa", name: "西班牙语" },
  es: { lang: "spa", name: "西班牙语" },
  rus: { lang: "rus", name: "俄语" },
  ru: { lang: "rus", name: "俄语" },
  ita: { lang: "ita", name: "意大利语" },
  it: { lang: "ita", name: "意大利语" },
  por: { lang: "por", name: "葡萄牙语" },
  pt: { lang: "por", name: "葡萄牙语" },
  "pt-br": { lang: "por", name: "葡萄牙语(巴西)" },
  tha: { lang: "tha", name: "泰语" },
  th: { lang: "tha", name: "泰语" },
  vie: { lang: "vie", name: "越南语" },
  vi: { lang: "vie", name: "越南语" },
  ara: { lang: "ara", name: "阿拉伯语" },
  ar: { lang: "ara", name: "阿拉伯语" },
  yue: { lang: "yue", name: "粤语" },
  cantonese: { lang: "yue", name: "粤语" },
  dan: { lang: "dan", name: "丹麦语" },
  da: { lang: "dan", name: "丹麦语" },
  nl: { lang: "dut", name: "荷兰语" },
  dut: { lang: "dut", name: "荷兰语" },
  nld: { lang: "dut", name: "荷兰语" },
  fin: { lang: "fin", name: "芬兰语" },
  fi: { lang: "fin", name: "芬兰语" },
  gre: { lang: "gre", name: "希腊语" },
  ell: { lang: "gre", name: "希腊语" },
  el: { lang: "gre", name: "希腊语" },
  heb: { lang: "heb", name: "希伯来语" },
  he: { lang: "heb", name: "希伯来语" },
  hin: { lang: "hin", name: "印地语" },
  hi: { lang: "hin", name: "印地语" },
  hun: { lang: "hun", name: "匈牙利语" },
  hu: { lang: "hun", name: "匈牙利语" },
  ind: { lang: "ind", name: "印尼语" },
  id: { lang: "ind", name: "印尼语" },
  nor: { lang: "nor", name: "挪威语" },
  no: { lang: "nor", name: "挪威语" },
  nob: { lang: "nor", name: "挪威语" },
  pol: { lang: "pol", name: "波兰语" },
  pl: { lang: "pol", name: "波兰语" },
  rum: { lang: "rum", name: "罗马尼亚语" },
  ron: { lang: "rum", name: "罗马尼亚语" },
  ro: { lang: "rum", name: "罗马尼亚语" },
  swe: { lang: "swe", name: "瑞典语" },
  sv: { lang: "swe", name: "瑞典语" },
  tur: { lang: "tur", name: "土耳其语" },
  tr: { lang: "tur", name: "土耳其语" },
  ukr: { lang: "ukr", name: "乌克兰语" },
  uk: { lang: "ukr", name: "乌克兰语" },
  cze: { lang: "cze", name: "捷克语" },
  ces: { lang: "cze", name: "捷克语" },
  cs: { lang: "cze", name: "捷克语" },
  slo: { lang: "slo", name: "斯洛伐克语" },
  slk: { lang: "slo", name: "斯洛伐克语" },
  sk: { lang: "slo", name: "斯洛伐克语" },
  bul: { lang: "bul", name: "保加利亚语" },
  bg: { lang: "bul", name: "保加利亚语" },
  est: { lang: "est", name: "爱沙尼亚语" },
  et: { lang: "est", name: "爱沙尼亚语" },
};

/**
 * Checks whether a given string is a placeholder or generic "no title" / codec label.
 */
export function isGenericOrEmptySubtitleTitle(title?: string | null): boolean {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (
    t === "no title" ||
    t === "no title (subrip)" ||
    t === "subrip" ||
    t === "srt" ||
    t === "ass" ||
    t === "ssa" ||
    t === "vtt" ||
    t === "und" ||
    t === "unknown" ||
    t === "null" ||
    t === "undefined" ||
    t === "none" ||
    t === "subtitle" ||
    t === "subtitles"
  ) {
    return true;
  }
  // Matches "no title (anything)" or "no title"
  if (/^no\s+title(\s*\([^)]*\))?$/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Builds clean human-readable title, canonical language tag, and file name for subtitle tracks.
 */
export function formatSubtitleTrackInfo(
  subtitleTitle?: string | null,
  language?: string | null,
  extension = "srt",
): SubtitleTrackInfo {
  const rawLang = (language || "").trim().toLowerCase();
  const langEntry = SUBTITLE_LANG_MAP[rawLang];
  const canonicalLang = langEntry?.lang || (rawLang && rawLang !== "und" && rawLang !== "unknown" ? rawLang : "");
  const defaultLangName = langEntry?.name || (rawLang && rawLang !== "und" && rawLang !== "unknown" ? rawLang.toUpperCase() : "字幕");

  let trackLabel = (subtitleTitle || "").trim();

  // Strip placeholder titles
  if (isGenericOrEmptySubtitleTitle(trackLabel)) {
    trackLabel = defaultLangName;
  }

  // Strip redundant extension from label if present
  trackLabel = trackLabel.replace(new RegExp(`\\.${extension}$`, "i"), "").trim();

  // If label is just raw language code or common descriptor, normalize it
  const lowerLabel = trackLabel.toLowerCase();
  if (SUBTITLE_LANG_MAP[lowerLabel]) {
    trackLabel = SUBTITLE_LANG_MAP[lowerLabel].name;
  } else if (lowerLabel === "simplified") {
    trackLabel = "简体中文";
  } else if (lowerLabel === "traditional") {
    trackLabel = "繁体中文";
  } else if (lowerLabel === "forced") {
    trackLabel = `${defaultLangName} (Forced)`;
  } else if (lowerLabel === "default") {
    trackLabel = `${defaultLangName} (Default)`;
  }

  // Ensure [外挂] prefix so it's distinguishable in IINA subtitle menu
  if (!trackLabel.startsWith("[外挂]")) {
    trackLabel = `[外挂] ${trackLabel}`;
  }

  // Sanitize forbidden filesystem characters without stripping Chinese/Unicode characters
  const safeBase = trackLabel.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").trim() || "[外挂] 字幕";
  const fileName = `${safeBase}.${extension}`;

  return {
    title: trackLabel,
    lang: canonicalLang,
    fileName,
  };
}

/**
 * Convenience helper returning clean external subtitle filename.
 */
export function formatExternalSubtitleFileName(
  subtitleTitle?: string | null,
  language?: string | null,
  extension = "srt",
): string {
  return formatSubtitleTrackInfo(subtitleTitle, language, extension).fileName;
}

/**
 * Formats a clean display label for a subtitle stream in the web UI.
 */
export function formatSubtitleDisplayLabel(sub: {
  DisplayTitle?: string;
  Title?: string;
  DisplayLanguage?: string;
  Language?: string;
  Codec?: string;
}): string {
  const displayTitle = typeof sub.DisplayTitle === "string" ? sub.DisplayTitle.trim() : "";
  if (displayTitle && !isGenericOrEmptySubtitleTitle(displayTitle)) {
    return displayTitle;
  }
  const title = typeof sub.Title === "string" ? sub.Title.trim() : "";
  const lang = sub.DisplayLanguage || sub.Language || "Sub";
  const codec = sub.Codec?.toUpperCase() || "SRT";
  if (title && !isGenericOrEmptySubtitleTitle(title) && title !== lang) {
    return `${lang} (${title})`;
  }
  return `${lang} (${codec})`;
}
