import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { DebugLogger } from "./debug-log";
import { createOutroManager, type OutroManagerDeps } from "./outro-manager";

describe("createOutroManager", () => {
  let mockCore: {
    status: { duration: number; position: number };
    osd: Mock;
    seekTo: Mock;
  };
  let mockMpv: {
    getNumber: Mock;
    command: Mock;
    set: Mock;
    getNative: Mock;
  };
  let mockPreferences: {
    get: Mock;
  };
  let mockMarkReplacingPlayback: Mock;
  let mockMarkAsWatched: Mock;
  let mockLog: DebugLogger;

  beforeEach(() => {
    mockCore = {
      status: { duration: 1440, position: 0 },
      osd: vi.fn(),
      seekTo: vi.fn(),
    };

    mockMpv = {
      getNumber: vi.fn((prop: string) => {
        if (prop === "playlist-count") return 2;
        if (prop === "playlist-pos") return 0;
        if (prop === "duration") return 1440;
        return 0;
      }),
      command: vi.fn(),
      set: vi.fn(),
      getNative: vi.fn(() => []),
    };

    mockPreferences = {
      get: vi.fn((key: string) => {
        if (key === "auto_skip_outro") return true;
        if (key === "show_notifications") return true;
        return true;
      }),
    };

    mockMarkReplacingPlayback = vi.fn();
    mockMarkAsWatched = vi.fn().mockResolvedValue(true);
    mockLog = Object.assign(vi.fn(), {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }) as unknown as DebugLogger;
  });

  function createTestManager() {
    return createOutroManager({
      core: mockCore as unknown as OutroManagerDeps["core"],
      mpv: mockMpv as unknown as OutroManagerDeps["mpv"],
      preferences: mockPreferences as unknown as OutroManagerDeps["preferences"],
      markReplacingPlayback: mockMarkReplacingPlayback,
      markAsWatched: mockMarkAsWatched,
      log: mockLog,
    });
  }

  it("does not trigger skip if no outro segment was detected", () => {
    const manager = createTestManager();

    const skipped = manager.checkAndTriggerSkip(1300);
    expect(skipped).toBe(false);
    expect(mockMpv.command).not.toHaveBeenCalled();
  });

  it("triggers automatic skip to next playlist item when position reaches outro", () => {
    const manager = createTestManager();

    manager.setSession("http://localhost:8096", "item-123", "token-xyz");
    manager.updateMetadataChapters(
      [
        { StartPositionTicks: 0, Name: "Episode" },
        { StartPositionTicks: 13200000000, MarkerType: "CreditsStart", Name: "Credits" },
      ],
      1440,
    );

    expect(manager.getCurrentOutroSegment()).not.toBeNull();
    expect(manager.getCurrentOutroSegment()?.startSeconds).toBe(1320);

    // Before outro: no skip
    expect(manager.checkAndTriggerSkip(1318)).toBe(false);
    expect(manager.hasSkipped()).toBe(false);

    // At outro: triggers skip
    const skipped = manager.checkAndTriggerSkip(1320);
    expect(skipped).toBe(true);
    expect(manager.hasSkipped()).toBe(true);

    // Verifies watched report, OSD, replacement guard, and playlist-next
    expect(mockMarkAsWatched).toHaveBeenCalledWith("http://localhost:8096", "item-123", "token-xyz");
    expect(mockCore.osd).toHaveBeenCalledWith("已跳过片尾");
    expect(mockMarkReplacingPlayback).toHaveBeenCalled();
    expect(mockMpv.command).toHaveBeenCalledWith("playlist-next", []);
  });

  it("seeks to post-credits scene if subsequent chapter exists and no playlist next", () => {
    mockMpv.getNumber.mockImplementation((prop: string) => {
      if (prop === "playlist-count") return 1;
      if (prop === "playlist-pos") return 0;
      if (prop === "duration") return 1500;
      return 0;
    });

    const manager = createTestManager();

    manager.updateMetadataChapters(
      [
        { StartPositionTicks: 0, Name: "Start" },
        { StartPositionTicks: 13000000000, MarkerType: "CreditsStart", Name: "Ending" },
        { StartPositionTicks: 14200000000, Name: "Post-Credits Scene" },
      ],
      1500,
    );

    const segment = manager.getCurrentOutroSegment();
    expect(segment?.hasNextChapter).toBe(true);
    expect(segment?.nextChapterStartTime).toBe(1420);

    const skipped = manager.checkAndTriggerSkip(1300);
    expect(skipped).toBe(true);
    expect(mockCore.seekTo).toHaveBeenCalledWith(1420);
    expect(mockMpv.command).not.toHaveBeenCalledWith("playlist-next");
  });

  it("seeks to end of file when no next playlist item and no post-credits chapter", () => {
    mockMpv.getNumber.mockImplementation((prop: string) => {
      if (prop === "playlist-count") return 1;
      if (prop === "playlist-pos") return 0;
      if (prop === "duration") return 1440;
      return 0;
    });

    const manager = createTestManager();

    manager.updateMetadataChapters(
      [
        { StartPositionTicks: 0, Name: "Start" },
        { StartPositionTicks: 13200000000, MarkerType: "CreditsStart", Name: "Ending" },
      ],
      1440,
    );

    const skipped = manager.checkAndTriggerSkip(1320);
    expect(skipped).toBe(true);
    expect(mockCore.seekTo).toHaveBeenCalledWith(1439.8);
  });

  it("does not auto-skip when auto_skip_outro preference is disabled", () => {
    mockPreferences.get.mockImplementation((key: string) => {
      if (key === "auto_skip_outro") return false;
      return true;
    });

    const manager = createTestManager();

    manager.updateMetadataChapters([{ StartPositionTicks: 13200000000, MarkerType: "CreditsStart" }], 1440);

    expect(manager.checkAndTriggerSkip(1320)).toBe(false);
    expect(mockMpv.command).not.toHaveBeenCalled();
  });

  it("resets hasSkippedOutro if user rewinds back before outro", () => {
    const manager = createTestManager();

    manager.updateMetadataChapters([{ StartPositionTicks: 13200000000, MarkerType: "CreditsStart" }], 1440);

    // Skip triggered
    manager.checkAndTriggerSkip(1320);
    expect(manager.hasSkipped()).toBe(true);

    // User rewound to minute 15 (900s)
    manager.checkAndTriggerSkip(900);
    expect(manager.hasSkipped()).toBe(false);

    // Reaching outro again triggers skip again
    expect(manager.checkAndTriggerSkip(1320)).toBe(true);
  });
});
