export interface SavedTrackSelection {
  itemId: string;
  seriesId?: string;
  audioStreamIndex?: number | null;
  subtitleStreamIndex?: number | null; // -1 if disabled
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
  audioTitle?: string | null;
  subtitleTitle?: string | null;
  audioChannels?: number | null;
  channelLayout?: string | null;
  updatedAt: number;
}

export interface SeriesTrackPreference {
  seriesId: string;
  audioLanguage?: string | null;
  subtitleLanguage?: string | null;
  audioChannels?: number | null;
  channelLayout?: string | null;
  updatedAt: number;
}

export interface PreferencesLike {
  get: (key: string) => unknown;
  set: (key: string, value: unknown) => void;
  sync?: () => void;
}

const PREF_ITEM_TRACKS_KEY = "emby_track_preferences";
const PREF_SERIES_TRACKS_KEY = "emby_series_track_preferences";
const MAX_ITEM_ENTRIES = 200;
const MAX_SERIES_ENTRIES = 100;

function safeParseJson<T>(raw: unknown, defaultValue: T): T {
  if (typeof raw !== "string" || !raw.trim()) {
    if (raw && typeof raw === "object") return raw as T;
    return defaultValue;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    return defaultValue;
  }
}

export function saveTrackSelection(
  preferences: PreferencesLike,
  itemId: string,
  selection: Omit<SavedTrackSelection, "itemId" | "updatedAt">,
  seriesId?: string,
): void {
  if (!preferences || !itemId) return;

  const rawMap = preferences.get(PREF_ITEM_TRACKS_KEY);
  const itemMap = safeParseJson<Record<string, SavedTrackSelection>>(rawMap, {});

  const now = Date.now();
  itemMap[itemId] = {
    ...selection,
    itemId,
    seriesId: seriesId || selection.seriesId,
    updatedAt: now,
  };

  // LRU eviction if size exceeds limit
  const itemKeys = Object.keys(itemMap);
  if (itemKeys.length > MAX_ITEM_ENTRIES) {
    const sortedKeys = itemKeys.sort((a, b) => (itemMap[a]?.updatedAt || 0) - (itemMap[b]?.updatedAt || 0));
    const toRemove = sortedKeys.slice(0, itemKeys.length - MAX_ITEM_ENTRIES);
    for (const key of toRemove) {
      delete itemMap[key];
    }
  }

  preferences.set(PREF_ITEM_TRACKS_KEY, JSON.stringify(itemMap));

  // If this item belongs to a TV series, also update series-level language preference
  const effectiveSeriesId = seriesId || selection.seriesId;
  if (effectiveSeriesId && (selection.audioLanguage || selection.subtitleLanguage || selection.subtitleStreamIndex === -1 || selection.audioChannels || selection.channelLayout)) {
    const rawSeriesMap = preferences.get(PREF_SERIES_TRACKS_KEY);
    const seriesMap = safeParseJson<Record<string, SeriesTrackPreference>>(rawSeriesMap, {});

    seriesMap[effectiveSeriesId] = {
      seriesId: effectiveSeriesId,
      audioLanguage: selection.audioLanguage ?? seriesMap[effectiveSeriesId]?.audioLanguage ?? null,
      audioChannels: selection.audioChannels ?? seriesMap[effectiveSeriesId]?.audioChannels ?? null,
      channelLayout: selection.channelLayout ?? seriesMap[effectiveSeriesId]?.channelLayout ?? null,
      subtitleLanguage:
        selection.subtitleStreamIndex === -1
          ? "off"
          : (selection.subtitleLanguage ?? seriesMap[effectiveSeriesId]?.subtitleLanguage ?? null),
      updatedAt: now,
    };

    const seriesKeys = Object.keys(seriesMap);
    if (seriesKeys.length > MAX_SERIES_ENTRIES) {
      const sortedSeriesKeys = seriesKeys.sort(
        (a, b) => (seriesMap[a]?.updatedAt || 0) - (seriesMap[b]?.updatedAt || 0),
      );
      const toRemoveSeries = sortedSeriesKeys.slice(0, seriesKeys.length - MAX_SERIES_ENTRIES);
      for (const k of toRemoveSeries) {
        delete seriesMap[k];
      }
    }

    preferences.set(PREF_SERIES_TRACKS_KEY, JSON.stringify(seriesMap));
  }

  if (typeof preferences.sync === "function") {
    preferences.sync();
  }
}

export function getSavedTrackSelection(
  preferences: PreferencesLike,
  itemId: string,
  seriesId?: string,
): SavedTrackSelection | null {
  if (!preferences || !itemId) return null;

  const rawMap = preferences.get(PREF_ITEM_TRACKS_KEY);
  const itemMap = safeParseJson<Record<string, SavedTrackSelection>>(rawMap, {});
  const saved = itemMap[itemId];

  if (saved) {
    return saved;
  }

  // If no item-specific track preference, check if we have a series-level preference
  if (seriesId) {
    const rawSeriesMap = preferences.get(PREF_SERIES_TRACKS_KEY);
    const seriesMap = safeParseJson<Record<string, SeriesTrackPreference>>(rawSeriesMap, {});
    const seriesPref = seriesMap[seriesId];

    if (seriesPref) {
      return {
        itemId,
        seriesId,
        audioStreamIndex: null,
        audioLanguage: seriesPref.audioLanguage ?? null,
        audioChannels: seriesPref.audioChannels ?? null,
        channelLayout: seriesPref.channelLayout ?? null,
        subtitleLanguage: seriesPref.subtitleLanguage === "off" ? null : (seriesPref.subtitleLanguage ?? null),
        subtitleStreamIndex: seriesPref.subtitleLanguage === "off" ? -1 : null,
        updatedAt: seriesPref.updatedAt,
      };
    }
  }

  return null;
}

export function clearTrackSelection(preferences: PreferencesLike, itemId?: string): void {
  if (!preferences) return;
  if (itemId) {
    const rawMap = preferences.get(PREF_ITEM_TRACKS_KEY);
    const itemMap = safeParseJson<Record<string, SavedTrackSelection>>(rawMap, {});
    if (itemMap[itemId]) {
      delete itemMap[itemId];
      preferences.set(PREF_ITEM_TRACKS_KEY, JSON.stringify(itemMap));
      if (typeof preferences.sync === "function") preferences.sync();
    }
  } else {
    preferences.set(PREF_ITEM_TRACKS_KEY, "{}");
    preferences.set(PREF_SERIES_TRACKS_KEY, "{}");
    if (typeof preferences.sync === "function") preferences.sync();
  }
}
