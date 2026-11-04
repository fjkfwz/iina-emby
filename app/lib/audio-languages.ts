export interface AudioLanguageDefinition {
  id: string;
  key: string;
  defaultLabel: string;
  nativeLabel: string;
  codes: string[];
}

export const AUDIO_LANGUAGES: AudioLanguageDefinition[] = [
  {
    id: "zh",
    key: "audioLangZh",
    defaultLabel: "Chinese (Mandarin)",
    nativeLabel: "中文 (普通话 / 国语)",
    codes: ["zh", "chi", "cmn"],
  },
  {
    id: "yue",
    key: "audioLangYue",
    defaultLabel: "Cantonese",
    nativeLabel: "粤语 (广东话)",
    codes: ["yue", "cantonese"],
  },
  {
    id: "ja",
    key: "audioLangJa",
    defaultLabel: "Japanese",
    nativeLabel: "日本語 (日语)",
    codes: ["ja", "jpn"],
  },
  {
    id: "en",
    key: "audioLangEn",
    defaultLabel: "English",
    nativeLabel: "English (英语)",
    codes: ["en", "eng"],
  },
  {
    id: "ko",
    key: "audioLangKo",
    defaultLabel: "Korean",
    nativeLabel: "한국어 (韩语)",
    codes: ["ko", "kor"],
  },
  {
    id: "fr",
    key: "audioLangFr",
    defaultLabel: "French",
    nativeLabel: "Français (法语)",
    codes: ["fr", "fre", "fra"],
  },
  {
    id: "de",
    key: "audioLangDe",
    defaultLabel: "German",
    nativeLabel: "Deutsch (德语)",
    codes: ["de", "ger", "deu"],
  },
  {
    id: "es",
    key: "audioLangEs",
    defaultLabel: "Spanish",
    nativeLabel: "Español (西班牙语)",
    codes: ["es", "spa"],
  },
  {
    id: "ru",
    key: "audioLangRu",
    defaultLabel: "Russian",
    nativeLabel: "Русский (俄语)",
    codes: ["ru", "rus"],
  },
  {
    id: "it",
    key: "audioLangIt",
    defaultLabel: "Italian",
    nativeLabel: "Italiano (意大利语)",
    codes: ["it", "ita"],
  },
  {
    id: "pt",
    key: "audioLangPt",
    defaultLabel: "Portuguese",
    nativeLabel: "Português (葡萄牙语)",
    codes: ["pt", "por"],
  },
  {
    id: "th",
    key: "audioLangTh",
    defaultLabel: "Thai",
    nativeLabel: "ไทย (泰语)",
    codes: ["th", "tha"],
  },
  {
    id: "vi",
    key: "audioLangVi",
    defaultLabel: "Vietnamese",
    nativeLabel: "Tiếng Việt (越南语)",
    codes: ["vi", "vie"],
  },
  {
    id: "ar",
    key: "audioLangAr",
    defaultLabel: "Arabic",
    nativeLabel: "العربية (阿拉伯语)",
    codes: ["ar", "ara"],
  },
  {
    id: "hi",
    key: "audioLangHi",
    defaultLabel: "Hindi",
    nativeLabel: "हिन्दी (印地语)",
    codes: ["hi", "hin"],
  },
];

export const DEFAULT_AUDIO_LANGUAGE_IDS: string[] = ["zh", "ja", "en"];
export const DEFAULT_AUDIO_LANGUAGE_STRING = "zh,chi,ja,jpn,en,eng";

export const SUBTITLE_LANGUAGES: AudioLanguageDefinition[] = [
  {
    id: "zh-hans",
    key: "subLangZhHans",
    defaultLabel: "Chinese (Simplified)",
    nativeLabel: "简体中文 (Simplified)",
    codes: ["zh", "chi", "chs", "sc"],
  },
  {
    id: "zh-hant",
    key: "subLangZhHant",
    defaultLabel: "Chinese (Traditional)",
    nativeLabel: "繁体中文 (Traditional)",
    codes: ["cht", "tc"],
  },
  {
    id: "en",
    key: "audioLangEn",
    defaultLabel: "English",
    nativeLabel: "English (英语)",
    codes: ["en", "eng"],
  },
  {
    id: "ja",
    key: "audioLangJa",
    defaultLabel: "Japanese",
    nativeLabel: "日本語 (日语)",
    codes: ["ja", "jpn"],
  },
  {
    id: "ko",
    key: "audioLangKo",
    defaultLabel: "Korean",
    nativeLabel: "한국어 (韩语)",
    codes: ["ko", "kor"],
  },
  {
    id: "fr",
    key: "audioLangFr",
    defaultLabel: "French",
    nativeLabel: "Français (法语)",
    codes: ["fr", "fre", "fra"],
  },
  {
    id: "de",
    key: "audioLangDe",
    defaultLabel: "German",
    nativeLabel: "Deutsch (德语)",
    codes: ["de", "ger", "deu"],
  },
  {
    id: "es",
    key: "audioLangEs",
    defaultLabel: "Spanish",
    nativeLabel: "Español (西班牙语)",
    codes: ["es", "spa"],
  },
  {
    id: "ru",
    key: "audioLangRu",
    defaultLabel: "Russian",
    nativeLabel: "Русский (俄语)",
    codes: ["ru", "rus"],
  },
  {
    id: "it",
    key: "audioLangIt",
    defaultLabel: "Italian",
    nativeLabel: "Italiano (意大利语)",
    codes: ["it", "ita"],
  },
  {
    id: "pt",
    key: "audioLangPt",
    defaultLabel: "Portuguese",
    nativeLabel: "Português (葡萄牙语)",
    codes: ["pt", "por"],
  },
  {
    id: "th",
    key: "audioLangTh",
    defaultLabel: "Thai",
    nativeLabel: "ไทย (泰语)",
    codes: ["th", "tha"],
  },
  {
    id: "vi",
    key: "audioLangVi",
    defaultLabel: "Vietnamese",
    nativeLabel: "Tiếng Việt (越南语)",
    codes: ["vi", "vie"],
  },
  {
    id: "ar",
    key: "audioLangAr",
    defaultLabel: "Arabic",
    nativeLabel: "العربية (阿拉伯语)",
    codes: ["ar", "ara"],
  },
  {
    id: "hi",
    key: "audioLangHi",
    defaultLabel: "Hindi",
    nativeLabel: "हिन्दी (印地语)",
    codes: ["hi", "hin"],
  },
];

export const DEFAULT_SUBTITLE_LANGUAGE_IDS: string[] = ["zh-hans", "zh-hant", "en"];
export const DEFAULT_SUBTITLE_LANGUAGE_STRING = "zh,chi,chs,sc,cht,tc,en";

// Fast lookup map from code -> language id
const CODE_TO_LANG_ID: Record<string, string> = {};
for (const lang of AUDIO_LANGUAGES) {
  for (const code of lang.codes) {
    CODE_TO_LANG_ID[code.toLowerCase()] = lang.id;
  }
}

const SUB_CODE_TO_LANG_ID: Record<string, string> = {};
for (const lang of SUBTITLE_LANGUAGES) {
  for (const code of lang.codes) {
    SUB_CODE_TO_LANG_ID[code.toLowerCase()] = lang.id;
  }
}

export interface ParsedAudioLanguages {
  selectedIds: string[];
  customCodes: string[];
}

/**
 * Parses a comma/whitespace separated string into ordered language IDs and any custom unrecognized codes.
 * Order of language occurrence in the raw string dictates the priority sequence.
 */
export function parseAudioLanguageString(raw?: string | null): ParsedAudioLanguages {
  if (!raw?.trim()) {
    return { selectedIds: [], customCodes: [] };
  }

  const tokens = raw
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  const selectedIds: string[] = [];
  const seenIds = new Set<string>();
  const customCodes: string[] = [];

  for (const token of tokens) {
    const matchedId = CODE_TO_LANG_ID[token];
    if (matchedId) {
      if (!seenIds.has(matchedId)) {
        seenIds.add(matchedId);
        selectedIds.push(matchedId);
      }
    } else {
      if (!customCodes.includes(token)) {
        customCodes.push(token);
      }
    }
  }

  return { selectedIds, customCodes };
}

/**
 * Parses a comma/whitespace separated string into ordered subtitle language IDs and any custom unrecognized codes.
 */
export function parseSubtitleLanguageString(raw?: string | null): ParsedAudioLanguages {
  if (!raw?.trim()) {
    return { selectedIds: [], customCodes: [] };
  }

  const tokens = raw
    .split(/[,;\s]+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length > 0);

  const selectedIds: string[] = [];
  const seenIds = new Set<string>();
  const customCodes: string[] = [];

  for (const token of tokens) {
    const matchedId = SUB_CODE_TO_LANG_ID[token];
    if (matchedId) {
      if (!seenIds.has(matchedId)) {
        seenIds.add(matchedId);
        selectedIds.push(matchedId);
      }
    } else {
      if (!customCodes.includes(token)) {
        customCodes.push(token);
      }
    }
  }

  return { selectedIds, customCodes };
}

/**
 * Serializes ordered subtitle language IDs (and optional custom codes) into a comma-separated string.
 */
export function serializeSubtitleLanguages(selectedIds: string[], customCodes?: string[]): string {
  const parts: string[] = [];
  const langMap = new Map<string, AudioLanguageDefinition>(SUBTITLE_LANGUAGES.map((l) => [l.id, l]));

  for (const id of selectedIds) {
    const def = langMap.get(id);
    if (def) {
      parts.push(...def.codes);
    }
  }

  if (customCodes && customCodes.length > 0) {
    for (const c of customCodes) {
      const clean = c.trim().toLowerCase();
      if (clean && !parts.includes(clean)) {
        parts.push(clean);
      }
    }
  }

  return parts.join(",");
}

/**
 * Serializes ordered language IDs (and optional custom codes) into a comma-separated string
 * compatible with IINA / Emby track matching preferences.
 */
export function serializeAudioLanguages(selectedIds: string[], customCodes?: string[]): string {
  const parts: string[] = [];
  const langMap = new Map<string, AudioLanguageDefinition>(AUDIO_LANGUAGES.map((l) => [l.id, l]));

  for (const id of selectedIds) {
    const def = langMap.get(id);
    if (def) {
      parts.push(...def.codes);
    }
  }

  if (customCodes && customCodes.length > 0) {
    for (const c of customCodes) {
      const clean = c.trim().toLowerCase();
      if (clean && !parts.includes(clean)) {
        parts.push(clean);
      }
    }
  }

  return parts.join(",");
}

/**
 * Toggles a language ID in the selection list.
 * If already selected, it is removed and remaining items maintain their relative order.
 * If not selected, it is appended to the end of the list (next priority).
 */
export function toggleAudioLanguage(currentIds: string[], idToToggle: string): string[] {
  if (currentIds.includes(idToToggle)) {
    return currentIds.filter((id) => id !== idToToggle);
  }
  return [...currentIds, idToToggle];
}

/**
 * Moves an item at index one step up (higher priority).
 */
export function moveAudioLanguageUp(currentIds: string[], index: number): string[] {
  if (index <= 0 || index >= currentIds.length) return currentIds;
  const next = [...currentIds];
  const temp = next[index - 1];
  next[index - 1] = next[index];
  next[index] = temp;
  return next;
}

/**
 * Moves an item at index one step down (lower priority).
 */
export function moveAudioLanguageDown(currentIds: string[], index: number): string[] {
  if (index < 0 || index >= currentIds.length - 1) return currentIds;
  const next = [...currentIds];
  const temp = next[index + 1];
  next[index + 1] = next[index];
  next[index] = temp;
  return next;
}
