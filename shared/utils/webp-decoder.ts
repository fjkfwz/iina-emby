let webpMachineInstance: any = null;
const decodedCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

const MAX_DECODED_CACHE_SIZE = 64;

function setMemoryCache(key: string, value: string): void {
  if (decodedCache.has(key)) {
    decodedCache.delete(key);
  } else if (decodedCache.size >= MAX_DECODED_CACHE_SIZE) {
    const oldestKey = decodedCache.keys().next().value;
    if (oldestKey !== undefined) {
      decodedCache.delete(oldestKey);
    }
  }
  decodedCache.set(key, value);
}

function getMemoryCache(key: string): string | undefined {
  const value = decodedCache.get(key);
  if (value !== undefined) {
    // Refresh LRU order
    decodedCache.delete(key);
    decodedCache.set(key, value);
  }
  return value;
}

// WebpMachine decodes sequentially because the underlying libwebp instance has shared state.
let decodeQueue: Promise<unknown> = Promise.resolve();

function enqueueDecode<T>(task: () => Promise<T>): Promise<T> {
  const next = decodeQueue.then(task, task);
  decodeQueue = next.then(
    () => {},
    () => {},
  );
  return next;
}

const DB_NAME = "iina_emby_cache";
const STORE_NAME = "decoded_webp_v1";

let dbPromise: Promise<IDBDatabase | null> | null = null;

function getDb(): Promise<IDBDatabase | null> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.resolve(null);
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }
  return dbPromise;
}

/**
 * Computes a stable cache key for a WebP image URL by removing transient tokens (api_key)
 * while preserving image identifiers and tags (ETags).
 */
export function getWebpCacheKey(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("api_key");
    return parsed.toString();
  } catch {
    return url.replace(/([?&])api_key=[^&]+(&|$)/, "$1").replace(/[?&]$/, "");
  }
}

async function getFromIdb(key: string): Promise<string | null> {
  try {
    const db = await getDb();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve((req.result as string) || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  } catch {
    return null;
  }
}

async function saveToIdb(key: string, value: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(value, key);
  } catch {
    // Non-fatal if storage quota is exceeded
  }
}

/**
 * Prefetches and populates in-memory cache from IndexedDB for an array of image URLs.
 * Enables instant synchronous rendering when cards mount.
 */
export async function prefetchDecodedWebp(imageUrls: string[]): Promise<void> {
  const missingKeys = imageUrls.map(getWebpCacheKey).filter((k) => !decodedCache.has(k));
  if (missingKeys.length === 0) return;

  await Promise.all(
    missingKeys.map(async (key) => {
      const val = await getFromIdb(key);
      if (val) {
        setMemoryCache(key, val);
      }
    }),
  );
}

/**
 * Decodes a WebP image URL into a PNG data URL using WebpMachine (Google libwebp in JS).
 * Polyfill for legacy browsers like Safari < 14 (macOS Catalina 10.15) where WebP is unsupported.
 * Results are cached in memory and persisted into IndexedDB for instant repeat visits.
 */
export async function decodeWebpToPng(imageUrl: string): Promise<string> {
  const cacheKey = getWebpCacheKey(imageUrl);

  const inMem = getMemoryCache(cacheKey);
  if (inMem) {
    return inMem;
  }

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    return existingRequest;
  }

  const task = async () => {
    try {
      // Check persistent IndexedDB cache before hitting the network
      const cachedPng = await getFromIdb(cacheKey);
      if (cachedPng) {
        setMemoryCache(cacheKey, cachedPng);
        return cachedPng;
      }

      const response = await fetch(imageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} fetching WebP image`);
      }
      const buffer = await response.arrayBuffer();
      const uint8 = new Uint8Array(buffer);

      if (!webpMachineInstance) {
        const { WebpMachine } = await import("webp-hero");
        webpMachineInstance = new WebpMachine();
      }

      // Run decoding through sequential queue to avoid WebpMachine "cannot decode when already busy"
      const pngDataUrl: string = await enqueueDecode(async () => {
        return webpMachineInstance.decode(uint8);
      });

      setMemoryCache(cacheKey, pngDataUrl);
      saveToIdb(cacheKey, pngDataUrl);
      return pngDataUrl;
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  };

  const decodePromise = task();
  inFlightRequests.set(cacheKey, decodePromise);
  return decodePromise;
}

/**
 * Returns the cached PNG data URL for a previously decoded WebP image, if available in memory.
 */
export function getCachedDecodedWebp(imageUrl: string): string | undefined {
  const cacheKey = getWebpCacheKey(imageUrl);
  return getMemoryCache(cacheKey);
}

/**
 * Testing helper: resets internal in-memory caches.
 */
export function _clearDecodedCacheForTest(): void {
  decodedCache.clear();
  inFlightRequests.clear();
  dbPromise = null;
}

export function _setMemoryCacheForTest(key: string, value: string): void {
  setMemoryCache(key, value);
}

