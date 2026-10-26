import { afterEach, describe, expect, it } from "vitest";
import {
  _setWebpSupportedForTest,
  type EmbyItemImageInfo,
  getEmbyImageUrl,
  getItemImageUrl,
  isNativeLazyLoadingSupported,
  isWebpSupported,
} from "./image";

describe("shared/utils/image", () => {
  afterEach(() => {
    _setWebpSupportedForTest(null);
  });

  describe("WebP detection and fallback", () => {
    it("defaults to webp in non-browser/node environment when supported", () => {
      _setWebpSupportedForTest(true);
      expect(isWebpSupported()).toBe(true);

      const url = getEmbyImageUrl("http://emby.local:8096", "item-1");
      expect(url).toContain("format=webp");
    });

    it("falls back to jpg when WebP is unsupported (e.g. Safari 13 / legacy WebKit)", () => {
      _setWebpSupportedForTest(false);
      expect(isWebpSupported()).toBe(false);

      const url = getEmbyImageUrl("http://emby.local:8096", "item-1");
      expect(url).toContain("format=jpg");
      expect(url).not.toContain("format=webp");
    });

    it("honors explicitly requested format regardless of WebP support", () => {
      _setWebpSupportedForTest(false);

      const pngUrl = getEmbyImageUrl("http://emby.local:8096", "item-1", { format: "png" });
      expect(pngUrl).toContain("format=png");

      const webpUrl = getEmbyImageUrl("http://emby.local:8096", "item-1", { format: "webp" });
      expect(webpUrl).toContain("format=webp");
    });
  });

  describe("getEmbyImageUrl", () => {
    it("builds image URL with dimension, quality, tag, and api_key params", () => {
      const url = getEmbyImageUrl("https://v1.uhdnow.com/emby/", "item-123", {
        imageType: "Primary",
        maxWidth: 280,
        maxHeight: 420,
        quality: 85,
        tag: "tag-abc",
        accessToken: "token-xyz",
        format: "jpg",
      });

      expect(url).toBe(
        "https://v1.uhdnow.com/emby/Items/item-123/Images/Primary?maxWidth=280&maxHeight=420&quality=85&format=jpg&tag=tag-abc&api_key=token-xyz",
      );
    });
  });

  describe("getItemImageUrl", () => {
    const item: EmbyItemImageInfo = {
      Id: "item-10",
      SeriesId: "series-99",
      ImageTags: {
        Primary: "primary-tag",
        Thumb: "thumb-tag",
      },
      BackdropImageTags: ["backdrop-tag"],
      ParentBackdropItemId: "parent-bd-id",
      ParentBackdropImageTags: ["parent-bd-tag"],
      ParentThumbItemId: "parent-th-id",
      ParentThumbImageTag: "parent-th-tag",
      SeriesPrimaryImageTag: "series-pri-tag",
    };

    it("favors thumb strategy by default (Thumb -> Backdrop -> Primary)", () => {
      const url = getItemImageUrl("http://emby.local", item);
      expect(url).toContain("/Items/item-10/Images/Thumb");
      expect(url).toContain("tag=thumb-tag");
    });

    it("favors backdrop strategy when requested", () => {
      const url = getItemImageUrl("http://emby.local", item, { prefer: "backdrop" });
      expect(url).toContain("/Items/item-10/Images/Backdrop");
      expect(url).toContain("tag=backdrop-tag");
    });

    it("favors primary strategy when requested", () => {
      const url = getItemImageUrl("http://emby.local", item, { prefer: "primary" });
      expect(url).toContain("/Items/item-10/Images/Primary");
      expect(url).toContain("tag=primary-tag");
    });

    it("falls back to parent backdrop when item has no own backdrop", () => {
      const itemWithoutBd: EmbyItemImageInfo = {
        Id: "item-20",
        ParentBackdropItemId: "parent-bd-id",
        ParentBackdropImageTags: ["parent-bd-tag"],
      };

      const url = getItemImageUrl("http://emby.local", itemWithoutBd, { prefer: "backdrop" });
      expect(url).toContain("/Items/parent-bd-id/Images/Backdrop");
      expect(url).toContain("tag=parent-bd-tag");
    });

    it("returns undefined when no candidate tags match", () => {
      const emptyItem: EmbyItemImageInfo = { Id: "empty-item" };
      const url = getItemImageUrl("http://emby.local", emptyItem);
      expect(url).toBeUndefined();
    });
  });

  describe("isNativeLazyLoadingSupported", () => {
    it("returns a boolean", () => {
      expect(typeof isNativeLazyLoadingSupported()).toBe("boolean");
    });
  });
});
