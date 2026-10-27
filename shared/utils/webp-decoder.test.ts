import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  _clearDecodedCacheForTest,
  _setMemoryCacheForTest,
  decodeWebpToPng,
  getCachedDecodedWebp,
  getWebpCacheKey,
} from "./webp-decoder";

describe("webp-decoder", () => {
  beforeEach(() => {
    _clearDecodedCacheForTest();
    vi.restoreAllMocks();
  });

  describe("getWebpCacheKey", () => {
    it("strips api_key parameter while preserving tag and dimensions", () => {
      const url =
        "https://emby.example.com/Items/123/Images/Primary?maxWidth=500&format=jpg&tag=abc123tag&api_key=secret-token";
      const key = getWebpCacheKey(url);
      expect(key).not.toContain("secret-token");
      expect(key).not.toContain("api_key");
      expect(key).toContain("maxWidth=500");
      expect(key).toContain("tag=abc123tag");
    });

    it("handles URL without api_key", () => {
      const url = "https://emby.example.com/Items/123/Images/Primary?maxWidth=500";
      expect(getWebpCacheKey(url)).toBe(url);
    });

    it("handles non-standard URLs gracefully", () => {
      const raw = "invalid-url?api_key=token&other=1";
      const key = getWebpCacheKey(raw);
      expect(key).not.toContain("token");
    });
  });

  describe("getCachedDecodedWebp and decodeWebpToPng", () => {
    it("returns undefined when image has not been decoded", () => {
      expect(getCachedDecodedWebp("https://example.com/test.webp")).toBeUndefined();
    });

    it("throws if response is not ok", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      } as unknown as Response);

      await expect(decodeWebpToPng("https://example.com/missing.webp")).rejects.toThrow("HTTP 404");
    });

    it("evicts oldest memory cache entry when exceeding maximum cache size", () => {
      // Populate 70 items
      for (let i = 0; i < 70; i++) {
        _setMemoryCacheForTest(`https://example.com/img_${i}.webp`, `data:image/png;base64,mock${i}`);
      }

      // The first items should be evicted from memory cache (max 64)
      expect(getCachedDecodedWebp("https://example.com/img_0.webp")).toBeUndefined();
      expect(getCachedDecodedWebp("https://example.com/img_5.webp")).toBeUndefined();
      // The newest items should still be in memory cache
      expect(getCachedDecodedWebp("https://example.com/img_69.webp")).toBe("data:image/png;base64,mock69");
    });
  });
});
