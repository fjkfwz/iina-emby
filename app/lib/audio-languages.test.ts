import { describe, expect, it } from "vitest";
import {
  DEFAULT_AUDIO_LANGUAGE_STRING,
  DEFAULT_SUBTITLE_LANGUAGE_STRING,
  moveAudioLanguageDown,
  moveAudioLanguageUp,
  parseAudioLanguageString,
  parseSubtitleLanguageString,
  serializeAudioLanguages,
  serializeSubtitleLanguages,
  toggleAudioLanguage,
} from "./audio-languages";

describe("audio-languages utility", () => {
  it("correctly parses default audio language string preserving order", () => {
    const result = parseAudioLanguageString(DEFAULT_AUDIO_LANGUAGE_STRING);
    expect(result.selectedIds).toEqual(["zh", "ja", "en"]);
    expect(result.customCodes).toEqual([]);
  });

  it("parses inverted priority order correctly", () => {
    const result = parseAudioLanguageString("ja,jpn,zh,chi,en,eng");
    expect(result.selectedIds).toEqual(["ja", "zh", "en"]);
    expect(result.customCodes).toEqual([]);
  });

  it("handles custom unrecognized codes without losing them", () => {
    const result = parseAudioLanguageString("ko,kor,tlh,und,en");
    expect(result.selectedIds).toEqual(["ko", "en"]);
    expect(result.customCodes).toEqual(["tlh", "und"]);
  });

  it("handles empty or null inputs", () => {
    expect(parseAudioLanguageString("")).toEqual({ selectedIds: [], customCodes: [] });
    expect(parseAudioLanguageString(null)).toEqual({ selectedIds: [], customCodes: [] });
    expect(parseAudioLanguageString(undefined)).toEqual({ selectedIds: [], customCodes: [] });
  });

  it("serializes selected language IDs in exact priority order", () => {
    const serialized = serializeAudioLanguages(["ja", "zh", "en"]);
    expect(serialized).toBe("ja,jpn,zh,chi,cmn,en,eng");
  });

  it("serializes with custom codes at the end", () => {
    const serialized = serializeAudioLanguages(["ko"], ["tlh", "und"]);
    expect(serialized).toBe("ko,kor,tlh,und");
  });

  it("appends newly checked language to the end of selection", () => {
    let ids = ["zh", "ja"];
    ids = toggleAudioLanguage(ids, "en");
    expect(ids).toEqual(["zh", "ja", "en"]);

    ids = toggleAudioLanguage(ids, "ko");
    expect(ids).toEqual(["zh", "ja", "en", "ko"]);
  });

  it("removes unchecked language while preserving order of remaining items", () => {
    let ids = ["zh", "ja", "en", "ko"];
    ids = toggleAudioLanguage(ids, "ja");
    expect(ids).toEqual(["zh", "en", "ko"]);

    // If re-checked, it goes to the end
    ids = toggleAudioLanguage(ids, "ja");
    expect(ids).toEqual(["zh", "en", "ko", "ja"]);
  });

  it("supports reordering via moveAudioLanguageUp and moveAudioLanguageDown", () => {
    let ids = ["zh", "ja", "en"];
    // Move "ja" (index 1) up
    ids = moveAudioLanguageUp(ids, 1);
    expect(ids).toEqual(["ja", "zh", "en"]);

    // Moving index 0 up does nothing
    expect(moveAudioLanguageUp(ids, 0)).toEqual(["ja", "zh", "en"]);

    // Move "ja" (index 0) down
    ids = moveAudioLanguageDown(ids, 0);
    expect(ids).toEqual(["zh", "ja", "en"]);

    // Moving last index down does nothing
    expect(moveAudioLanguageDown(ids, 2)).toEqual(["zh", "ja", "en"]);
  });

  it("correctly parses default subtitle language string distinguishing simplified and traditional Chinese", () => {
    const result = parseSubtitleLanguageString(DEFAULT_SUBTITLE_LANGUAGE_STRING);
    expect(result.selectedIds).toEqual(["zh-hans", "zh-hant", "en"]);
    expect(result.customCodes).toEqual([]);
  });

  it("serializes subtitle language IDs in exact priority order", () => {
    const serialized = serializeSubtitleLanguages(["zh-hant", "en"]);
    expect(serialized).toBe("cht,tc,en,eng");
  });
});
