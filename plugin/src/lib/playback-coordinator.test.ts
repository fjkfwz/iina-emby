import { describe, expect, it, vi } from "vitest";
import { createPlaybackCoordinator } from "./playback-coordinator";

describe("playback-coordinator", () => {
  function createTestCoordinator() {
    const mockCore = {
      open: vi.fn(),
      osd: vi.fn(),
    } as unknown as typeof iina.core;

    const mockMpv = {
      command: vi.fn(),
      set: vi.fn(),
      getNumber: vi.fn().mockReturnValue(0),
    } as unknown as typeof iina.mpv;

    const mockPreferences = {
      get: vi.fn().mockReturnValue(false),
    } as unknown as typeof iina.preferences;

    const mockLog = vi.fn() as unknown as any;
    mockLog.error = vi.fn();

    return createPlaybackCoordinator({
      core: mockCore,
      mpv: mockMpv,
      preferences: mockPreferences,
      getCurrentPlaybackSession: () => null,
      clearQueuedFlag: vi.fn(),
      log: mockLog,
    });
  }

  it("stores and retrieves pending audio and subtitle tracks correctly", () => {
    const coordinator = createTestCoordinator();

    coordinator.setPendingPlaybackData({
      streamUrl: "http://localhost:8096/Videos/item-123/stream?static=true",
      title: "Test Movie",
      selectedAudioIndex: 2,
      selectedSubtitleIndex: 4,
      audioTrackNumber: 2,
      subtitleTrackNumber: 2,
      audioLanguage: "chi",
      subtitleLanguage: "chi",
      isExternalSubtitle: false,
      subtitleCodec: "subrip",
    });

    expect(coordinator.getPendingAudioIndex("item-123")).toBe(2);
    expect(coordinator.getPendingSubtitleIndex("item-123")).toBe(4);
    expect(coordinator.getPendingAudioTrackNumber("item-123")).toBe(2);
    expect(coordinator.getPendingSubtitleTrackNumber("item-123")).toBe(2);
    expect(coordinator.getPendingAudioLanguage("item-123")).toBe("chi");
    expect(coordinator.getPendingSubtitleLanguage("item-123")).toBe("chi");
    expect(coordinator.getPendingIsExternalSubtitle("item-123")).toBe(false);
    expect(coordinator.getPendingSubtitleCodec("item-123")).toBe("subrip");

    // Returns null for unrelated item
    expect(coordinator.getPendingAudioIndex("item-other")).toBeNull();
  });

  it("handles turning off subtitles with selectedSubtitleIndex: -1", () => {
    const coordinator = createTestCoordinator();

    coordinator.setPendingPlaybackData({
      streamUrl: "http://localhost:8096/Videos/item-456/stream?static=true",
      title: "Movie Without Subtitles",
      selectedAudioIndex: 1,
      selectedSubtitleIndex: -1,
      audioTrackNumber: 1,
    });

    expect(coordinator.getPendingSubtitleIndex("item-456")).toBe(-1);
    expect(coordinator.getPendingSubtitleTrackNumber("item-456")).toBeNull();
  });

  it("correctly parses external subtitle properties", () => {
    const coordinator = createTestCoordinator();

    coordinator.setPendingPlaybackData({
      streamUrl: "http://localhost:8096/Videos/item-789/stream?static=true",
      title: "Movie With External Sub",
      selectedAudioIndex: 1,
      selectedSubtitleIndex: 5,
      isExternalSubtitle: true,
      subtitlePath: "/path/to/sub.zh.srt",
      subtitleCodec: "srt",
      subtitleLanguage: "zh",
      mediaSourceId: "ms-source-123",
      subtitleDeliveryUrl: "/play/subtitle/sub-token-xyz",
      subtitleTitle: "简中 (默认)",
    });

    expect(coordinator.getPendingIsExternalSubtitle("item-789")).toBe(true);
    expect(coordinator.getPendingSubtitlePath("item-789")).toBe("/path/to/sub.zh.srt");
    expect(coordinator.getPendingSubtitleCodec("item-789")).toBe("srt");
    expect(coordinator.getPendingSubtitleLanguage("item-789")).toBe("zh");
    expect(coordinator.getPendingMediaSourceId("item-789")).toBe("ms-source-123");
    expect(coordinator.getPendingSubtitleDeliveryUrl("item-789")).toBe("/play/subtitle/sub-token-xyz");
    expect(coordinator.getPendingSubtitleTitle("item-789")).toBe("简中 (默认)");
  });

  it("handles playMedia storing track metadata before opening", () => {
    const coordinator = createTestCoordinator();

    coordinator.handlePlayMedia({
      streamUrl: "http://localhost:8096/Videos/item-play/stream?static=true",
      title: "Episode 1",
      selectedAudioIndex: 3,
      selectedSubtitleIndex: 2,
      audioTrackNumber: 2,
      subtitleTrackNumber: 1,
      startPositionTicks: 100000000, // 10 seconds
    });

    expect(coordinator.getPendingAudioIndex("item-play")).toBe(3);
    expect(coordinator.getPendingSubtitleIndex("item-play")).toBe(2);
    expect(coordinator.getPendingAudioTrackNumber("item-play")).toBe(2);
    expect(coordinator.getPendingSubtitleTrackNumber("item-play")).toBe(1);
    expect(coordinator.getPendingStartPosition("item-play")).toBe(10);
  });

  it("clears pending audio and subtitle tracks once handled", () => {
    const coordinator = createTestCoordinator();

    coordinator.setPendingPlaybackData({
      streamUrl: "http://localhost:8096/Videos/item-clear/stream?static=true",
      title: "Episode To Clear",
      selectedAudioIndex: 3,
      selectedSubtitleIndex: 2,
      audioTrackNumber: 2,
      subtitleTrackNumber: 1,
    });

    expect(coordinator.getPendingSubtitleIndex("item-clear")).toBe(2);
    coordinator.clearPendingSubtitle("item-clear");
    expect(coordinator.getPendingSubtitleIndex("item-clear")).toBeNull();
    expect(coordinator.getPendingSubtitleTrackNumber("item-clear")).toBeNull();

    expect(coordinator.getPendingAudioIndex("item-clear")).toBe(3);
    coordinator.clearPendingAudio("item-clear");
    expect(coordinator.getPendingAudioIndex("item-clear")).toBeNull();
  });

  it("handles handlePlayMediaList storing metadata and queueing remaining items", () => {
    const coordinator = createTestCoordinator();

    coordinator.handlePlayMediaList({
      items: [
        {
          streamUrl: "http://localhost:8096/Videos/ep-1/stream?static=true",
          title: "Series - S01E01 - Pilot",
          selectedAudioIndex: 1,
          selectedSubtitleIndex: 2,
          startPositionTicks: 200000000, // 20 seconds
        },
        {
          streamUrl: "http://localhost:8096/Videos/ep-2/stream?static=true",
          title: "Series - S01E02 - Second Episode",
        },
      ],
    });

    expect(coordinator.getPendingAudioIndex("ep-1")).toBe(1);
    expect(coordinator.getPendingSubtitleIndex("ep-1")).toBe(2);
    expect(coordinator.getPendingStartPosition("ep-1")).toBe(20);
    expect(coordinator.getPendingMediaTitle("ep-1")).toBe("Series - S01E01 - Pilot");
    expect(coordinator.getPendingMediaTitle("ep-2")).toBe("Series - S01E02 - Second Episode");
    expect(coordinator.isLaunchedFromBrowser()).toBe(true);
  });

  it("uses mpv loadfile replace instead of core.open when opening in current window", () => {
    const mockCore = {
      open: vi.fn(),
      osd: vi.fn(),
    } as unknown as typeof iina.core;

    const mockMpv = {
      command: vi.fn(),
      set: vi.fn(),
      getNumber: vi.fn().mockReturnValue(0),
    } as unknown as typeof iina.mpv;

    const coordinator = createPlaybackCoordinator({
      core: mockCore,
      mpv: mockMpv,
      preferences: { get: vi.fn().mockReturnValue(false) } as unknown as typeof iina.preferences,
      getCurrentPlaybackSession: () => null,
      clearQueuedFlag: vi.fn(),
      log: vi.fn() as any,
    });

    coordinator.openInCurrentWindow("http://localhost:8096/Videos/ep-1/stream", "Episode 1");

    expect(mockMpv.command).toHaveBeenCalledWith("loadfile", ["http://localhost:8096/Videos/ep-1/stream", "replace"]);
    expect(mockCore.open).not.toHaveBeenCalled();
  });
});
