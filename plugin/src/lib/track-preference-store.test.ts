import { beforeEach, describe, expect, it } from "vitest";
import {
  clearTrackSelection,
  getSavedTrackSelection,
  saveTrackSelection,
  type PreferencesLike,
} from "./track-preference-store";

describe("track-preference-store", () => {
  let mockStore: Record<string, unknown>;
  let mockPreferences: PreferencesLike;

  beforeEach(() => {
    mockStore = {};
    mockPreferences = {
      get: (key: string) => mockStore[key],
      set: (key: string, value: unknown) => {
        mockStore[key] = value;
      },
      sync: () => {},
    };
  });

  it("saves and retrieves track selection for an item", () => {
    saveTrackSelection(mockPreferences, "movie-1", {
      audioStreamIndex: 1,
      subtitleStreamIndex: 3,
      audioLanguage: "ja",
      subtitleLanguage: "zh",
    });

    const retrieved = getSavedTrackSelection(mockPreferences, "movie-1");
    expect(retrieved).toBeDefined();
    expect(retrieved?.audioStreamIndex).toBe(1);
    expect(retrieved?.subtitleStreamIndex).toBe(3);
    expect(retrieved?.audioLanguage).toBe("ja");
    expect(retrieved?.subtitleLanguage).toBe("zh");
  });

  it("handles subtitles turned off (index -1)", () => {
    saveTrackSelection(mockPreferences, "movie-2", {
      audioStreamIndex: 0,
      subtitleStreamIndex: -1,
    });

    const retrieved = getSavedTrackSelection(mockPreferences, "movie-2");
    expect(retrieved?.subtitleStreamIndex).toBe(-1);
  });

  it("inherits series-level language and channel layout preference for subsequent episodes", () => {
    saveTrackSelection(
      mockPreferences,
      "ep-1",
      {
        audioStreamIndex: 2,
        subtitleStreamIndex: 4,
        audioLanguage: "jpn",
        subtitleLanguage: "chi",
        audioChannels: 6,
        channelLayout: "5.1",
      },
      "series-100",
    );

    // Now query for episode 2 of the same series, which has no specific item record
    const retrievedEp2 = getSavedTrackSelection(mockPreferences, "ep-2", "series-100");
    expect(retrievedEp2).toBeDefined();
    expect(retrievedEp2?.audioLanguage).toBe("jpn");
    expect(retrievedEp2?.subtitleLanguage).toBe("chi");
    expect(retrievedEp2?.audioChannels).toBe(6);
    expect(retrievedEp2?.channelLayout).toBe("5.1");
    expect(retrievedEp2?.audioStreamIndex).toBeNull(); // stream indices are container-specific
  });

  it("clears track selection for specific item and globally", () => {
    saveTrackSelection(mockPreferences, "item-a", { audioStreamIndex: 1 });
    saveTrackSelection(mockPreferences, "item-b", { audioStreamIndex: 2 });

    clearTrackSelection(mockPreferences, "item-a");
    expect(getSavedTrackSelection(mockPreferences, "item-a")).toBeNull();
    expect(getSavedTrackSelection(mockPreferences, "item-b")).not.toBeNull();

    clearTrackSelection(mockPreferences);
    expect(getSavedTrackSelection(mockPreferences, "item-b")).toBeNull();
  });
});
