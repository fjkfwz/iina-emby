import { describe, expect, it } from "vitest";
import { formatExternalSubtitleFileName } from "./media-actions";

describe("formatExternalSubtitleFileName", () => {
  it("formats normal display title with [外挂] prefix", () => {
    const fileName = formatExternalSubtitleFileName("简中 (默认)", "chi", "srt");
    expect(fileName).toBe("[外挂] 简中 (默认).srt");
  });

  it("does not duplicate [外挂] prefix if already present", () => {
    const fileName = formatExternalSubtitleFileName("[外挂] 简体中文", "chi", "srt");
    expect(fileName).toBe("[外挂] 简体中文.srt");
  });

  it("maps ISO code to readable language when title is just the code", () => {
    expect(formatExternalSubtitleFileName("chi", "chi", "srt")).toBe("[外挂] 简体中文.srt");
    expect(formatExternalSubtitleFileName("zho", "zho", "srt")).toBe("[外挂] 简体中文.srt");
    expect(formatExternalSubtitleFileName("zh-cn", "zh-cn", "srt")).toBe("[外挂] 简体中文.srt");
    expect(formatExternalSubtitleFileName("zh-tw", "zh-tw", "srt")).toBe("[外挂] 繁体中文.srt");
    expect(formatExternalSubtitleFileName("eng", "eng", "srt")).toBe("[外挂] 英语.srt");
    expect(formatExternalSubtitleFileName("jpn", "jpn", "ass")).toBe("[外挂] 日语.ass");
    expect(formatExternalSubtitleFileName("kor", "kor", "vtt")).toBe("[外挂] 韩语.vtt");
  });

  it("falls back to language when title is empty", () => {
    expect(formatExternalSubtitleFileName(null, "chi", "srt")).toBe("[外挂] 简体中文.srt");
    expect(formatExternalSubtitleFileName("", "eng", "srt")).toBe("[外挂] 英语.srt");
    expect(formatExternalSubtitleFileName(undefined, "fre", "srt")).toBe("[外挂] 法语.srt");
    expect(formatExternalSubtitleFileName(undefined, "xyz", "srt")).toBe("[外挂] XYZ.srt");
  });

  it("handles unknown or undefined language gracefully", () => {
    expect(formatExternalSubtitleFileName(null, "und", "srt")).toBe("[外挂] 字幕.srt");
    expect(formatExternalSubtitleFileName(null, "unknown", "srt")).toBe("[外挂] 字幕.srt");
    expect(formatExternalSubtitleFileName("", "", "srt")).toBe("[外挂] 字幕.srt");
  });

  it("strips trailing extension from title to prevent double extension", () => {
    expect(formatExternalSubtitleFileName("特效简中.ass", "chi", "ass")).toBe("[外挂] 特效简中.ass");
    expect(formatExternalSubtitleFileName("movie.zh-cn.srt", "chi", "srt")).toBe("[外挂] movie.zh-cn.srt");
  });

  it("replaces invalid path characters while keeping Chinese characters and spaces", () => {
    const fileName = formatExternalSubtitleFileName("中文 / English: 电影? *测试*", "chi", "srt");
    expect(fileName).toBe("[外挂] 中文 _ English_ 电影_ _测试_.srt");
  });

  it("formats generic 'No Title (subrip)' to language name instead of showing No Title", () => {
    expect(formatExternalSubtitleFileName("No Title (subrip)", "chi", "srt")).toBe("[外挂] 简体中文.srt");
    expect(formatExternalSubtitleFileName("no title", "eng", "srt")).toBe("[外挂] 英语.srt");
    expect(formatExternalSubtitleFileName("subrip", "jpn", "srt")).toBe("[外挂] 日语.srt");
  });
});
