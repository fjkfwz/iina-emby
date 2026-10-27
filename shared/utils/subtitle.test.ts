import { describe, expect, it } from "vitest";
import {
  formatExternalSubtitleFileName,
  formatSubtitleDisplayLabel,
  formatSubtitleTrackInfo,
  isGenericOrEmptySubtitleTitle,
} from "./subtitle";

describe("isGenericOrEmptySubtitleTitle", () => {
  it("identifies placeholder and generic titles", () => {
    expect(isGenericOrEmptySubtitleTitle(null)).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("   ")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("No Title")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("no title (subrip)")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("No Title (srt)")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("subrip")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("srt")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("und")).toBe(true);
    expect(isGenericOrEmptySubtitleTitle("unknown")).toBe(true);
  });

  it("identifies valid custom titles as non-generic", () => {
    expect(isGenericOrEmptySubtitleTitle("Simplified")).toBe(false);
    expect(isGenericOrEmptySubtitleTitle("简中 (默认)")).toBe(false);
    expect(isGenericOrEmptySubtitleTitle("English SDH")).toBe(false);
    expect(isGenericOrEmptySubtitleTitle("Commentary")).toBe(false);
  });
});

describe("formatSubtitleTrackInfo", () => {
  it("formats generic 'No Title (subrip)' to language name with [外挂] prefix", () => {
    const info = formatSubtitleTrackInfo("No Title (subrip)", "chi", "srt");
    expect(info.title).toBe("[外挂] 简体中文");
    expect(info.lang).toBe("chi");
    expect(info.fileName).toBe("[外挂] 简体中文.srt");
  });

  it("formats empty title with fallback to language", () => {
    const info = formatSubtitleTrackInfo(null, "eng", "srt");
    expect(info.title).toBe("[外挂] 英语");
    expect(info.lang).toBe("eng");
    expect(info.fileName).toBe("[外挂] 英语.srt");
  });

  it("formats normal display title with [外挂] prefix", () => {
    const info = formatSubtitleTrackInfo("简中 (默认)", "chi", "srt");
    expect(info.title).toBe("[外挂] 简中 (默认)");
    expect(info.lang).toBe("chi");
    expect(info.fileName).toBe("[外挂] 简中 (默认).srt");
  });

  it("handles Forced and Default keywords", () => {
    const forced = formatSubtitleTrackInfo("Forced", "eng", "srt");
    expect(forced.title).toBe("[外挂] 英语 (Forced)");

    const simplified = formatSubtitleTrackInfo("Simplified", "chi", "srt");
    expect(simplified.title).toBe("[外挂] 简体中文");
  });

  it("does not duplicate [外挂] prefix if already present", () => {
    const info = formatSubtitleTrackInfo("[外挂] 简体中文", "chi", "srt");
    expect(info.title).toBe("[外挂] 简体中文");
    expect(info.fileName).toBe("[外挂] 简体中文.srt");
  });

  it("handles unknown or undefined language gracefully", () => {
    const info = formatSubtitleTrackInfo(null, "und", "srt");
    expect(info.title).toBe("[外挂] 字幕");
    expect(info.lang).toBe("");
    expect(info.fileName).toBe("[外挂] 字幕.srt");
  });
});

describe("formatSubtitleDisplayLabel", () => {
  it("uses DisplayTitle when valid", () => {
    expect(
      formatSubtitleDisplayLabel({
        DisplayTitle: "中文 (SRT) - Simplified",
        Language: "chi",
        Codec: "subrip",
      }),
    ).toBe("中文 (SRT) - Simplified");
  });

  it("ignores generic No Title (subrip) in DisplayTitle and falls back to language/title", () => {
    expect(
      formatSubtitleDisplayLabel({
        DisplayTitle: "No Title (subrip)",
        Title: "Simplified",
        DisplayLanguage: "中文",
        Language: "chi",
        Codec: "subrip",
      }),
    ).toBe("中文 (Simplified)");
  });

  it("falls back to language + codec when no title", () => {
    expect(
      formatSubtitleDisplayLabel({
        DisplayLanguage: "中文",
        Language: "chi",
        Codec: "subrip",
      }),
    ).toBe("中文 (SUBRIP)");
  });
});
