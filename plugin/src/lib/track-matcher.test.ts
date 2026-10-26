import { describe, expect, it } from "vitest";
import {
  canonicalizeLanguage,
  detectChineseVariant,
  findMatchingAudioTrack,
  findMatchingSubtitleTrack,
  type MpvTrack,
} from "./track-matcher";

describe("track-matcher", () => {
  describe("canonicalizeLanguage", () => {
    it("maps Chinese variants and codes to zh", () => {
      expect(canonicalizeLanguage("chi")).toBe("zh");
      expect(canonicalizeLanguage("zho")).toBe("zh");
      expect(canonicalizeLanguage("zh")).toBe("zh");
      expect(canonicalizeLanguage("zh-Hans")).toBe("zh");
      expect(canonicalizeLanguage("zh-CN")).toBe("zh");
      expect(canonicalizeLanguage("zh-Hant")).toBe("zh");
      expect(canonicalizeLanguage("中文")).toBe("zh");
    });

    it("maps English codes to en", () => {
      expect(canonicalizeLanguage("eng")).toBe("en");
      expect(canonicalizeLanguage("en")).toBe("en");
      expect(canonicalizeLanguage("en-US")).toBe("en");
      expect(canonicalizeLanguage("English")).toBe("en");
    });

    it("maps Japanese codes to ja", () => {
      expect(canonicalizeLanguage("jpn")).toBe("ja");
      expect(canonicalizeLanguage("ja")).toBe("ja");
    });

    it("returns null or raw clean string for unknown languages", () => {
      expect(canonicalizeLanguage(null)).toBeNull();
      expect(canonicalizeLanguage(undefined)).toBeNull();
      expect(canonicalizeLanguage("xyz")).toBe("xyz");
    });
  });

  describe("detectChineseVariant", () => {
    it("identifies simplified Chinese keywords", () => {
      expect(detectChineseVariant("Simplified")).toBe("simplified");
      expect(detectChineseVariant("zh-Hans")).toBe("simplified");
      expect(detectChineseVariant("简体中文")).toBe("simplified");
      expect(detectChineseVariant("CHS")).toBe("simplified");
    });

    it("identifies traditional Chinese keywords", () => {
      expect(detectChineseVariant("Traditional")).toBe("traditional");
      expect(detectChineseVariant("zh-Hant")).toBe("traditional");
      expect(detectChineseVariant("繁體中文")).toBe("traditional");
      expect(detectChineseVariant("CHT")).toBe("traditional");
    });

    it("returns unknown when variant is unspecified", () => {
      expect(detectChineseVariant("Chinese")).toBe("unknown");
      expect(detectChineseVariant("English")).toBe("unknown");
      expect(detectChineseVariant(null)).toBe("unknown");
    });
  });

  describe("findMatchingSubtitleTrack", () => {
    const mockTracks: MpvTrack[] = [
      {
        id: 1,
        type: "sub",
        "ff-index": 2,
        lang: "eng",
        title: "English Forced",
        forced: true,
        default: true,
      },
      {
        id: 2,
        type: "sub",
        "ff-index": 3,
        lang: "eng",
        title: "English",
        forced: false,
        default: false,
      },
      {
        id: 3,
        type: "sub",
        "ff-index": 4,
        lang: "zh-Hans",
        title: "Simplified",
        forced: false,
        default: false,
      },
      {
        id: 4,
        type: "sub",
        "ff-index": 5,
        lang: "zh-Hant",
        title: "Traditional",
        forced: false,
        default: false,
      },
      {
        id: 5,
        type: "sub",
        "ff-index": 6,
        lang: "jpn",
        title: "Japanese",
        forced: false,
        default: false,
      },
    ];

    it("matches Chinese Simplified track when user selects chi Simplified ('雪上之虎' / 'Tenzing' case)", () => {
      const match = findMatchingSubtitleTrack(mockTracks, {
        trackNumber: 3,
        streamIndex: 4,
        language: "chi",
        title: "中文 (SRT) - Simplified",
        codec: "srt",
      });

      expect(match).toBeDefined();
      expect(match?.id).toBe(3);
      expect(match?.title).toBe("Simplified");
    });

    it("matches Chinese Traditional track when user selects chi Traditional", () => {
      const match = findMatchingSubtitleTrack(mockTracks, {
        trackNumber: 4,
        streamIndex: 5,
        language: "chi",
        title: "中文 (SRT) - Traditional",
        codec: "srt",
      });

      expect(match).toBeDefined();
      expect(match?.id).toBe(4);
      expect(match?.title).toBe("Traditional");
    });

    it("matches by ff-index even if track order differs", () => {
      const reorderedTracks: MpvTrack[] = [mockTracks[3], mockTracks[2], mockTracks[0]];
      const match = findMatchingSubtitleTrack(reorderedTracks, {
        streamIndex: 4,
        language: "chi",
        title: "Simplified",
      });

      expect(match).toBeDefined();
      expect(match?.id).toBe(3);
    });

    it("falls back to trackNumber when metadata is minimal", () => {
      const minimalTracks: MpvTrack[] = [
        { id: 1, type: "sub" },
        { id: 2, type: "sub" },
        { id: 3, type: "sub" },
      ];

      const match = findMatchingSubtitleTrack(minimalTracks, {
        trackNumber: 2,
      });

      expect(match).toBeDefined();
      expect(match?.id).toBe(2);
    });

    it("returns undefined for empty track list", () => {
      expect(findMatchingSubtitleTrack([], { trackNumber: 1 })).toBeUndefined();
    });
  });

  describe("findMatchingAudioTrack", () => {
    const mockAudioTracks: MpvTrack[] = [
      {
        id: 1,
        type: "audio",
        "ff-index": 1,
        lang: "eng",
        title: "English 5.1",
        default: true,
      },
      {
        id: 2,
        type: "audio",
        "ff-index": 7,
        lang: "chi",
        title: "Mandarin",
        default: false,
      },
    ];

    it("matches audio track by language and relative position", () => {
      const match = findMatchingAudioTrack(mockAudioTracks, {
        trackNumber: 2,
        streamIndex: 7,
        language: "zh",
        title: "Mandarin",
      });

      expect(match).toBeDefined();
      expect(match?.id).toBe(2);
    });
  });
});
