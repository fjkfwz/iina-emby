import { useEffect, useState } from "react";

const STORAGE_KEY = "emby_search_history";
const MAX_HISTORY = 10;

/**
 * Safely reads the list of recent search terms from localStorage.
 */
export function getRecentSearches(): string[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .map((item) => item.trim())
      .slice(0, MAX_HISTORY);
  } catch {
    return [];
  }
}

/**
 * Adds a new search query to recent searches, placing it at the front and deduplicating.
 * Preserves a maximum of 10 items.
 */
export function addRecentSearch(query: string): string[] {
  const trimmed = query.trim();
  if (!trimmed || typeof window === "undefined" || !window.localStorage) {
    return getRecentSearches();
  }

  try {
    const current = getRecentSearches();
    // Case-insensitive deduplication, keeping user's casing
    const filtered = current.filter((item) => item.toLowerCase() !== trimmed.toLowerCase());
    const updated = [trimmed, ...filtered].slice(0, MAX_HISTORY);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("emby-search-history-updated", { detail: updated }));
    return updated;
  } catch {
    return [trimmed];
  }
}

/**
 * Removes a specific search query from recent searches.
 */
export function removeRecentSearch(query: string): string[] {
  if (typeof window === "undefined" || !window.localStorage) {
    return [];
  }

  try {
    const trimmed = query.trim().toLowerCase();
    const current = getRecentSearches();
    const updated = current.filter((item) => item.trim().toLowerCase() !== trimmed);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    window.dispatchEvent(new CustomEvent("emby-search-history-updated", { detail: updated }));
    return updated;
  } catch {
    return [];
  }
}

/**
 * Clears all recent search history.
 */
export function clearRecentSearches(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new CustomEvent("emby-search-history-updated", { detail: [] }));
  } catch {}
}

/**
 * React hook to access and manage the user's recent search history in real time.
 */
export function useSearchHistory() {
  const [history, setHistory] = useState<string[]>(() => getRecentSearches());

  useEffect(() => {
    // Initial sync
    setHistory(getRecentSearches());

    const handleUpdate = (e: Event) => {
      const custom = e as CustomEvent<string[]>;
      if (custom.detail && Array.isArray(custom.detail)) {
        setHistory(custom.detail);
      } else {
        setHistory(getRecentSearches());
      }
    };

    window.addEventListener("emby-search-history-updated", handleUpdate);
    return () => {
      window.removeEventListener("emby-search-history-updated", handleUpdate);
    };
  }, []);

  return {
    history,
    addSearch: addRecentSearch,
    removeSearch: removeRecentSearch,
    clearHistory: clearRecentSearches,
  };
}
