import { describe, expect, it } from "vitest";
import { findOutroSegment, isOutroMarker, isOutroPosition, isOutroTitle } from "./outro";

describe("outro utils", () => {
  describe("isOutroMarker", () => {
    it("recognizes standard Emby outro marker types", () => {
      expect(isOutroMarker("CreditsStart")).toBe(true);
      expect(isOutroMarker("creditsstart")).toBe(true);
      expect(isOutroMarker("OutroStart")).toBe(true);
      expect(isOutroMarker("Credits")).toBe(true);
      expect(isOutroMarker("Outro")).toBe(true);
      expect(isOutroMarker(undefined, "Credits")).toBe(true);
      expect(isOutroMarker(undefined, "outro")).toBe(true);
    });

    it("rejects non-outro marker types", () => {
      expect(isOutroMarker("IntroStart")).toBe(false);
      expect(isOutroMarker("IntroEnd")).toBe(false);
      expect(isOutroMarker("Chapter")).toBe(false);
      expect(isOutroMarker("")).toBe(false);
      expect(isOutroMarker(undefined, undefined)).toBe(false);
    });
  });

  describe("isOutroTitle", () => {
    it("recognizes English outro titles", () => {
      expect(isOutroTitle("Credits")).toBe(true);
      expect(isOutroTitle("Credit")).toBe(true);
      expect(isOutroTitle("End Credits")).toBe(true);
      expect(isOutroTitle("Ending Credits")).toBe(true);
      expect(isOutroTitle("Outro")).toBe(true);
      expect(isOutroTitle("Ending")).toBe(true);
      expect(isOutroTitle("Ending Theme")).toBe(true);
      expect(isOutroTitle("ED")).toBe(true);
      expect(isOutroTitle("ED 1")).toBe(true);
      expect(isOutroTitle("ED1")).toBe(true);
      expect(isOutroTitle("Closing Credits")).toBe(true);
    });

    it("recognizes Chinese outro titles", () => {
      expect(isOutroTitle("片尾")).toBe(true);
      expect(isOutroTitle("片尾曲")).toBe(true);
      expect(isOutroTitle("片尾字幕")).toBe(true);
      expect(isOutroTitle("结尾")).toBe(true);
      expect(isOutroTitle("演职员表")).toBe(true);
      expect(isOutroTitle("演职人员")).toBe(true);
    });

    it("recognizes Japanese outro titles", () => {
      expect(isOutroTitle("エンディング")).toBe(true);
      expect(isOutroTitle("エンドクレジット")).toBe(true);
      expect(isOutroTitle("クレジット")).toBe(true);
    });

    it("rejects non-outro titles", () => {
      expect(isOutroTitle("Intro")).toBe(false);
      expect(isOutroTitle("Opening")).toBe(false);
      expect(isOutroTitle("OP")).toBe(false);
      expect(isOutroTitle("Chapter 1")).toBe(false);
      expect(isOutroTitle("Prologue")).toBe(false);
      expect(isOutroTitle("Redemption")).toBe(false);
      expect(isOutroTitle("Educated")).toBe(false);
      expect(isOutroTitle("")).toBe(false);
      expect(isOutroTitle(undefined)).toBe(false);
    });
  });

  describe("isOutroPosition", () => {
    it("validates position with known duration", () => {
      // 1440s duration (24 min)
      expect(isOutroPosition(1300, 1440)).toBe(true);
      expect(isOutroPosition(720, 1440)).toBe(true);
      expect(isOutroPosition(700, 1440)).toBe(false);
      expect(isOutroPosition(120, 1440)).toBe(false);
    });

    it("validates position with unknown duration", () => {
      expect(isOutroPosition(65, null)).toBe(true);
      expect(isOutroPosition(45, null)).toBe(false);
      expect(isOutroPosition(0, null)).toBe(false);
    });
  });

  describe("findOutroSegment", () => {
    it("detects outro from Emby CreditsStart marker", () => {
      const result = findOutroSegment({
        chapters: [
          { Name: "Prologue", StartPositionTicks: 0, MarkerType: "Chapter" },
          { Name: "Intro", StartPositionTicks: 600000000, MarkerType: "IntroStart" },
          { Name: "Main", StartPositionTicks: 1500000000, MarkerType: "IntroEnd" },
          { Name: "Chapter 4", StartPositionTicks: 13200000000, MarkerType: "CreditsStart" },
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe("emby-marker");
      expect(result?.startSeconds).toBe(1320);
      expect(result?.endSeconds).toBe(1440);
      expect(result?.hasNextChapter).toBe(false);
    });

    it("detects outro from Emby chapter title when no MarkerType is set", () => {
      const result = findOutroSegment({
        chapters: [
          { Name: "Chapter 1", StartPositionTicks: 0 },
          { Name: "Chapter 2", StartPositionTicks: 6000000000 },
          { Name: "片尾曲", StartPositionTicks: 12900000000 },
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe("emby-chapter");
      expect(result?.startSeconds).toBe(1290);
      expect(result?.title).toBe("片尾曲");
      expect(result?.hasNextChapter).toBe(false);
    });

    it("detects subsequent post-credits chapter", () => {
      const result = findOutroSegment({
        chapters: [
          { Name: "Episode", StartPositionTicks: 0 },
          { Name: "Ending", StartPositionTicks: 12600000000, MarkerType: "CreditsStart" },
          { Name: "Next Episode Preview", StartPositionTicks: 13800000000 },
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.startSeconds).toBe(1260);
      expect(result?.hasNextChapter).toBe(true);
      expect(result?.nextChapterStartTime).toBe(1380);
      expect(result?.endSeconds).toBe(1380);
    });

    it("detects outro from MPV chapters when Emby has no chapters", () => {
      const result = findOutroSegment({
        chapters: [],
        mpvChapters: [
          { time: 0, title: "OP" },
          { time: 90, title: "Part A" },
          { time: 600, title: "Part B" },
          { time: 1320, title: "ED" },
        ],
        duration: 1440,
      });

      expect(result).not.toBeNull();
      expect(result?.source).toBe("mpv-chapter");
      expect(result?.startSeconds).toBe(1320);
      expect(result?.title).toBe("ED");
      expect(result?.hasNextChapter).toBe(false);
    });

    it("returns null when no outro chapters exist", () => {
      const result = findOutroSegment({
        chapters: [
          { Name: "Chapter 1", StartPositionTicks: 0 },
          { Name: "Chapter 2", StartPositionTicks: 6000000000 },
        ],
        duration: 1440,
      });

      expect(result).toBeNull();
    });

    it("returns null when chapters array is empty or undefined", () => {
      expect(findOutroSegment({})).toBeNull();
      expect(findOutroSegment({ chapters: null, mpvChapters: null })).toBeNull();
    });
  });
});
