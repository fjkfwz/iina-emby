import { describe, expect, it } from "vitest";
import { findIntroSegment, isIntroEndMarker, isIntroPosition, isIntroStartMarker, isIntroTitle } from "./intro";

describe("intro detection utility", () => {
  describe("isIntroStartMarker", () => {
    it("recognizes IntroStart and Intro marker types", () => {
      expect(isIntroStartMarker("IntroStart")).toBe(true);
      expect(isIntroStartMarker("introstart")).toBe(true);
      expect(isIntroStartMarker("Intro")).toBe(true);
      expect(isIntroStartMarker(undefined, "Intro")).toBe(true);
      expect(isIntroStartMarker("CreditsStart")).toBe(false);
      expect(isIntroStartMarker("Chapter")).toBe(false);
      expect(isIntroStartMarker(undefined, undefined)).toBe(false);
    });
  });

  describe("isIntroEndMarker", () => {
    it("recognizes IntroEnd marker types", () => {
      expect(isIntroEndMarker("IntroEnd")).toBe(true);
      expect(isIntroEndMarker("introend")).toBe(true);
      expect(isIntroEndMarker(undefined, "IntroEnd")).toBe(true);
      expect(isIntroEndMarker("IntroStart")).toBe(false);
      expect(isIntroEndMarker("Chapter")).toBe(false);
    });
  });

  describe("isIntroTitle", () => {
    it("matches English intro titles", () => {
      expect(isIntroTitle("Intro")).toBe(true);
      expect(isIntroTitle("Opening")).toBe(true);
      expect(isIntroTitle("OP")).toBe(true);
      expect(isIntroTitle("OP 1")).toBe(true);
      expect(isIntroTitle("OP1")).toBe(true);
      expect(isIntroTitle("Opening Theme")).toBe(true);
      expect(isIntroTitle("Introduction")).toBe(true);
    });

    it("matches Chinese and Japanese intro titles", () => {
      expect(isIntroTitle("片头")).toBe(true);
      expect(isIntroTitle("片头曲")).toBe(true);
      expect(isIntroTitle("片头动画")).toBe(true);
      expect(isIntroTitle("开头")).toBe(true);
      expect(isIntroTitle("オープニング")).toBe(true);
    });

    it("rejects non-intro titles", () => {
      expect(isIntroTitle("Chapter 1")).toBe(false);
      expect(isIntroTitle("Episode")).toBe(false);
      expect(isIntroTitle("Part A")).toBe(false);
      expect(isIntroTitle("ED")).toBe(false);
      expect(isIntroTitle("Credits")).toBe(false);
      expect(isIntroTitle("Avant")).toBe(false);
      expect(isIntroTitle("")).toBe(false);
      expect(isIntroTitle(undefined)).toBe(false);
    });
  });

  describe("isIntroPosition", () => {
    it("accepts positions in the first half of the media", () => {
      expect(isIntroPosition(0, 1400)).toBe(true);
      expect(isIntroPosition(60, 1400)).toBe(true);
      expect(isIntroPosition(700, 1400)).toBe(true);
      expect(isIntroPosition(800, 1400)).toBe(false);
    });

    it("handles fallback when duration is unknown", () => {
      expect(isIntroPosition(120, null)).toBe(true);
      expect(isIntroPosition(890, undefined)).toBe(true);
      expect(isIntroPosition(1000, undefined)).toBe(false);
    });
  });

  describe("findIntroSegment", () => {
    it("detects intro from Emby markers (IntroStart and IntroEnd)", () => {
      const result = findIntroSegment({
        chapters: [
          { Name: "Avant", StartPositionTicks: 0, MarkerType: "Chapter" },
          { Name: "Theme Song", StartPositionTicks: 600000000, MarkerType: "IntroStart" }, // 60s
          { Name: "Main Story", StartPositionTicks: 1500000000, MarkerType: "IntroEnd" }, // 150s
          { Name: "ED", StartPositionTicks: 13000000000, MarkerType: "CreditsStart" },
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.startSeconds).toBe(60);
      expect(result?.endSeconds).toBe(150);
      expect(result?.source).toBe("emby-marker");
    });

    it("detects intro from Emby marker followed by normal chapter", () => {
      const result = findIntroSegment({
        chapters: [
          { Name: "Avant", StartPositionTicks: 0, MarkerType: "Chapter" },
          { Name: "Opening", StartPositionTicks: 570000000, MarkerType: "IntroStart" }, // 57s
          { Name: "Part A", StartPositionTicks: 1470000000, MarkerType: "Chapter" }, // 147s
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.startSeconds).toBe(57);
      expect(result?.endSeconds).toBe(147);
      expect(result?.source).toBe("emby-marker");
    });

    it("detects intro from Emby chapter title", () => {
      const result = findIntroSegment({
        chapters: [
          { Name: "前情提要", StartPositionTicks: 0 },
          { Name: "片头曲", StartPositionTicks: 300000000 }, // 30s
          { Name: "正片", StartPositionTicks: 1200000000 }, // 120s
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.startSeconds).toBe(30);
      expect(result?.endSeconds).toBe(120);
      expect(result?.source).toBe("emby-chapter");
    });

    it("detects intro from MPV container chapters (e.g. Demon Slayer OP)", () => {
      const result = findIntroSegment({
        chapters: null,
        mpvChapters: [
          { title: "Avant", time: 0 },
          { title: "OP", time: 57 },
          { title: "Part A", time: 147 },
          { title: "Part B", time: 556 },
          { title: "ED", time: 1290 },
          { title: "Next", time: 1380 },
        ],
        duration: 1421,
      });

      expect(result).not.toBeNull();
      expect(result?.startSeconds).toBe(57);
      expect(result?.endSeconds).toBe(147);
      expect(result?.title).toBe("OP");
      expect(result?.source).toBe("mpv-chapter");
    });

    it("returns null if no intro chapter or marker is present", () => {
      const result = findIntroSegment({
        chapters: [
          { Name: "Chapter 1", StartPositionTicks: 0 },
          { Name: "Chapter 2", StartPositionTicks: 600000000 },
        ],
        mpvChapters: [
          { title: "Chapter 1", time: 0 },
          { title: "Chapter 2", time: 60 },
        ],
        duration: 1440,
      });

      expect(result).toBeNull();
    });

    it("ignores intro title appearing in late video (e.g. Demon Slayer S1E1 at 21:10)", () => {
      const result = findIntroSegment({
        chapters: null,
        mpvChapters: [
          { title: "Avant", time: 0 },
          { title: "OP", time: 1270 }, // 21:10 out of 1421s (>50%)
          { title: "ED", time: 1359 },
        ],
        duration: 1421,
      });

      expect(result).toBeNull();
    });
  });
});
