import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { DebugLogger } from "./debug-log";
import { createIntroManager, type IntroManagerDeps } from "./intro-manager";

describe("createIntroManager", () => {
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
  let mockLog: DebugLogger;

  beforeEach(() => {
    mockCore = {
      status: { duration: 1440, position: 0 },
      osd: vi.fn(),
      seekTo: vi.fn(),
    };

    mockMpv = {
      getNumber: vi.fn((prop: string) => {
        if (prop === "duration") return 1440;
        return 0;
      }),
      command: vi.fn(),
      set: vi.fn(),
      getNative: vi.fn(() => []),
    };

    mockPreferences = {
      get: vi.fn((key: string) => {
        if (key === "auto_skip_intro") return true;
        if (key === "show_notifications") return true;
        return true;
      }),
    };

    mockLog = Object.assign(vi.fn(), {
      debug: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
    }) as unknown as DebugLogger;
  });

  function createTestManager() {
    return createIntroManager({
      core: mockCore as unknown as IntroManagerDeps["core"],
      mpv: mockMpv as unknown as IntroManagerDeps["mpv"],
      preferences: mockPreferences as unknown as IntroManagerDeps["preferences"],
      log: mockLog,
    });
  }

  it("does not trigger skip if no intro segment was detected", () => {
    const manager = createTestManager();
    expect(manager.checkAndTriggerSkip(30)).toBe(false);
    expect(manager.hasSkipped()).toBe(false);
  });

  it("triggers automatic skip to intro end position when playback enters intro", () => {
    const manager = createTestManager();

    manager.setSession("item-123");
    // Emby chapter markers: Intro at 60s, Main story starts at 150s
    manager.updateMetadataChapters(
      [
        { Name: "Avant", StartPositionTicks: 0, MarkerType: "Chapter" },
        { Name: "Opening", StartPositionTicks: 600000000, MarkerType: "IntroStart" },
        { Name: "Main Story", StartPositionTicks: 1500000000, MarkerType: "IntroEnd" },
      ],
      1440,
    );

    expect(manager.getCurrentIntroSegment()).not.toBeNull();
    expect(manager.getCurrentIntroSegment()?.startSeconds).toBe(60);
    expect(manager.getCurrentIntroSegment()?.endSeconds).toBe(150);

    // Before intro: no skip
    expect(manager.checkAndTriggerSkip(50)).toBe(false);
    expect(manager.hasSkipped()).toBe(false);

    // Enters intro: triggers skip to 150s
    const skipped = manager.checkAndTriggerSkip(60);
    expect(skipped).toBe(true);
    expect(manager.hasSkipped()).toBe(true);
    expect(mockCore.seekTo).toHaveBeenCalledWith(150);
    expect(mockCore.osd).toHaveBeenCalledWith("已跳过片头");
  });

  it("detects intro from MPV container chapters (e.g. Demon Slayer S1E2)", () => {
    mockMpv.getNative.mockReturnValue([
      { title: "Avant", time: 0 },
      { title: "OP", time: 57 },
      { title: "Part A", time: 147 },
      { title: "Part B", time: 556 },
    ]);

    const manager = createTestManager();
    manager.setSession("item-456");
    manager.checkMpvChapters();

    expect(manager.getCurrentIntroSegment()).not.toBeNull();
    expect(manager.getCurrentIntroSegment()?.startSeconds).toBe(57);
    expect(manager.getCurrentIntroSegment()?.endSeconds).toBe(147);

    // At 58s, triggers skip
    const skipped = manager.checkAndTriggerSkip(58);
    expect(skipped).toBe(true);
    expect(mockCore.seekTo).toHaveBeenCalledWith(147);
  });

  it("does not auto-skip when auto_skip_intro preference is disabled", () => {
    mockPreferences.get.mockImplementation((key: string) => {
      if (key === "auto_skip_intro") return false;
      return true;
    });

    const manager = createTestManager();
    manager.updateMetadataChapters([
      { Name: "Intro", StartPositionTicks: 0, MarkerType: "IntroStart" },
      { Name: "Story", StartPositionTicks: 900000000, MarkerType: "IntroEnd" },
    ]);

    expect(manager.checkAndTriggerSkip(10)).toBe(false);
    expect(manager.hasSkipped()).toBe(false);
    expect(mockCore.seekTo).not.toHaveBeenCalled();
  });

  it("resets hasSkippedIntro if user rewinds back before intro", () => {
    const manager = createTestManager();
    manager.updateMetadataChapters([
      { Name: "Avant", StartPositionTicks: 0 },
      { Name: "OP", StartPositionTicks: 600000000 }, // 60s
      { Name: "Story", StartPositionTicks: 1500000000 }, // 150s
    ]);

    // Triggers first skip
    expect(manager.checkAndTriggerSkip(60)).toBe(true);
    expect(manager.hasSkipped()).toBe(true);

    // Subsequent positions inside intro don't re-trigger
    expect(manager.checkAndTriggerSkip(70)).toBe(false);

    // Rewinds back before intro (e.g. 40s < 60 - 5)
    manager.checkAndTriggerSkip(40);
    expect(manager.hasSkipped()).toBe(false);

    // Moving forward to intro triggers skip again
    expect(manager.checkAndTriggerSkip(60)).toBe(true);
  });

  it("manualSkipIntro seeks to end of intro if intro is detected", () => {
    const manager = createTestManager();
    manager.updateMetadataChapters([
      { Name: "OP", StartPositionTicks: 300000000 },
      { Name: "Story", StartPositionTicks: 1200000000 },
    ]);

    expect(manager.manualSkipIntro()).toBe(true);
    expect(mockCore.seekTo).toHaveBeenCalledWith(120);
    expect(mockCore.osd).toHaveBeenCalledWith("已跳过片头");
  });
});
