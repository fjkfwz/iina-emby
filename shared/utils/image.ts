let cachedWebpSupported: boolean | null = null;

/**
 * Detects whether the current runtime environment supports WebP decoding.
 * - In browser/WKWebView environments, uses an HTML5 Canvas to test WebP encoding/decoding.
 * - Returns false on legacy WebKit (such as Safari < 14 on macOS Catalina 10.15).
 * - Defaults to true in non-browser environments (e.g. Node.js unit tests).
 */
export function isWebpSupported(): boolean {
  if (cachedWebpSupported !== null) {
    return cachedWebpSupported;
  }

  if (typeof window === "undefined" || typeof document === "undefined") {
    return true;
  }

  try {
    const canvas = document.createElement("canvas");
    if (canvas && typeof canvas.toDataURL === "function") {
      const isSupported = canvas.toDataURL("image/webp").indexOf("data:image/webp") === 0;
      cachedWebpSupported = isSupported;
      return isSupported;
    }
  } catch {
    // ignore
  }

  cachedWebpSupported = false;
  return false;
}

/**
 * For testing purposes only: resets or overrides the cached WebP support state.
 */
export function _setWebpSupportedForTest(val: boolean | null): void {
  cachedWebpSupported = val;
}

/**
 * Detects whether native image lazy loading (loading="lazy") is supported by the current browser.
 * Safari < 15.4 does not support native lazy loading on <img> elements.
 */
export function isNativeLazyLoadingSupported(): boolean {
  if (typeof HTMLImageElement === "undefined") return false;
  return "loading" in HTMLImageElement.prototype;
}

export interface EmbyImageUrlOptions {
  imageType?: "Primary" | "Backdrop" | "Thumb" | "Banner" | "Logo";
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "webp" | "jpg" | "png";
  tag?: string;
  accessToken?: string;
}

export function getEmbyImageUrl(serverUrl: string, itemId: string, options?: EmbyImageUrlOptions): string {
  const cleanServer = serverUrl.replace(/\/+$/, "");
  const type = options?.imageType || "Primary";
  const params = new URLSearchParams();

  if (options?.maxWidth) params.set("maxWidth", String(options.maxWidth));
  if (options?.maxHeight) params.set("maxHeight", String(options.maxHeight));
  params.set("quality", String(options?.quality ?? 85));
  params.set("format", options?.format ?? (isWebpSupported() ? "webp" : "jpg"));
  if (options?.tag) params.set("tag", options.tag);
  if (options?.accessToken) params.set("api_key", options.accessToken);

  const query = params.toString();
  return `${cleanServer}/Items/${encodeURIComponent(itemId)}/Images/${type}${query ? `?${query}` : ""}`;
}

export interface EmbyItemImageInfo {
  Id: string;
  SeriesId?: string;
  ImageTags?: Record<string, string>;
  BackdropImageTags?: string[];
  ParentThumbItemId?: string;
  ParentThumbImageTag?: string;
  ParentBackdropItemId?: string;
  ParentBackdropImageTags?: string[];
  SeriesPrimaryImageTag?: string;
  [key: string]: unknown;
}

export interface ItemImageUrlOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: "webp" | "jpg" | "png";
  accessToken?: string;
  /**
   * Priority strategy:
   * - "backdrop": Favors high-res fanart backdrop first (Backdrop -> Parent Backdrop -> Thumb -> Parent Thumb -> Primary).
   *   Ideal for fullscreen item hero views.
   * - "thumb": Favors landscape 16:9 images (Thumb -> Backdrop -> Parent Backdrop/Thumb -> Primary).
   *   Ideal for Continue Watching and horizontal media cards.
   * - "primary": Favors the item's primary image first (Primary -> Thumb -> Backdrop -> Parent images).
   *   Ideal for series detail page episodes or posters.
   */
  prefer?: "backdrop" | "thumb" | "primary";
}

type ImageCandidateKey = "itemBackdrop" | "parentBackdrop" | "itemThumb" | "parentThumb" | "itemPrimary" | "seriesPrimary";

const STRATEGY_ORDER: Record<NonNullable<ItemImageUrlOptions["prefer"]>, ImageCandidateKey[]> = {
  backdrop: ["itemBackdrop", "parentBackdrop", "itemThumb", "parentThumb", "itemPrimary", "seriesPrimary"],
  thumb: ["itemThumb", "itemBackdrop", "parentBackdrop", "parentThumb", "itemPrimary", "seriesPrimary"],
  primary: ["itemPrimary", "itemThumb", "itemBackdrop", "parentBackdrop", "parentThumb", "seriesPrimary"],
};

/**
 * Resolves the best available image URL for an Emby item with configurable priority and fallback hierarchy:
 * - "backdrop" priority: Backdrop -> Parent Backdrop -> Thumb -> Parent Thumb -> Primary
 * - "thumb" priority (default for cards/Continue Watching): Thumb -> Backdrop -> Parent Backdrop -> Parent Thumb -> Primary
 * - "primary" priority (for series detail view): Primary -> Thumb -> Backdrop -> Parent Backdrop/Thumb
 */
export function getItemImageUrl(serverUrl: string, item: EmbyItemImageInfo, options?: ItemImageUrlOptions): string | undefined {
  const cleanServer = serverUrl.replace(/\/+$/, "");
  const prefer = options?.prefer || "thumb";
  const { prefer: _, ...imageOptions } = options || {};

  const candidates: Record<ImageCandidateKey, { itemId: string; type: "Primary" | "Backdrop" | "Thumb"; tag: string } | null> = {
    itemBackdrop: item.BackdropImageTags?.[0] ? { itemId: item.Id, type: "Backdrop", tag: item.BackdropImageTags[0] } : null,
    parentBackdrop:
      item.ParentBackdropItemId && item.ParentBackdropImageTags?.[0]
        ? { itemId: item.ParentBackdropItemId, type: "Backdrop", tag: item.ParentBackdropImageTags[0] }
        : null,
    itemThumb: item.ImageTags?.Thumb ? { itemId: item.Id, type: "Thumb", tag: item.ImageTags.Thumb } : null,
    parentThumb:
      item.ParentThumbItemId && item.ParentThumbImageTag
        ? { itemId: item.ParentThumbItemId, type: "Thumb", tag: item.ParentThumbImageTag }
        : null,
    itemPrimary: item.ImageTags?.Primary ? { itemId: item.Id, type: "Primary", tag: item.ImageTags.Primary } : null,
    seriesPrimary:
      item.SeriesId && item.SeriesPrimaryImageTag ? { itemId: item.SeriesId, type: "Primary", tag: item.SeriesPrimaryImageTag } : null,
  };

  const order = STRATEGY_ORDER[prefer] || STRATEGY_ORDER.thumb;
  for (const key of order) {
    const candidate = candidates[key];
    if (candidate) {
      return getEmbyImageUrl(cleanServer, candidate.itemId, {
        imageType: candidate.type,
        tag: candidate.tag,
        ...imageOptions,
      });
    }
  }

  return undefined;
}
