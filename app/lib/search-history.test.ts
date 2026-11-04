import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addRecentSearch, clearRecentSearches, getRecentSearches, removeRecentSearch } from "./search-history";

describe("search-history", () => {
  let store: Record<string, string> = {};

  beforeEach(() => {
    store = {};
    const mockLocalStorage = {
      getItem: (key: string) => store[key] || null,
      setItem: (key: string, value: string) => {
        store[key] = value;
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      },
    };

    const mockWindow = {
      localStorage: mockLocalStorage,
      dispatchEvent: () => true,
    };

    (globalThis as unknown as { window: unknown }).window = mockWindow;
  });

  afterEach(() => {
    store = {};
  });

  it("returns empty array when no history exists", () => {
    expect(getRecentSearches()).toEqual([]);
  });

  it("adds search terms to the front and limits to 10 entries", () => {
    for (let i = 1; i <= 12; i++) {
      addRecentSearch(`Search ${i}`);
    }

    const history = getRecentSearches();
    expect(history).toHaveLength(10);
    expect(history[0]).toBe("Search 12");
    expect(history[9]).toBe("Search 3");
  });

  it("deduplicates existing searches case-insensitively and puts latest at front", () => {
    addRecentSearch("Batman");
    addRecentSearch("Superman");
    addRecentSearch("batman");

    const history = getRecentSearches();
    expect(history).toHaveLength(2);
    expect(history[0]).toBe("batman");
    expect(history[1]).toBe("Superman");
  });

  it("removes an individual search term", () => {
    addRecentSearch("Inception");
    addRecentSearch("Interstellar");
    addRecentSearch("Dunkirk");

    const afterRemove = removeRecentSearch("Interstellar");
    expect(afterRemove).toEqual(["Dunkirk", "Inception"]);
    expect(getRecentSearches()).toEqual(["Dunkirk", "Inception"]);
  });

  it("clears all search history", () => {
    addRecentSearch("Avatar");
    addRecentSearch("Titanic");

    clearRecentSearches();
    expect(getRecentSearches()).toEqual([]);
  });

  it("ignores whitespace or empty strings", () => {
    addRecentSearch("   ");
    expect(getRecentSearches()).toEqual([]);
  });
});
