let webpMachineInstance: any = null;
const decodedCache = new Map<string, string>();
const inFlightRequests = new Map<string, Promise<string>>();

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

/**
 * Decodes a WebP image URL into a PNG data URL using WebpMachine (Google libwebp in JS).
 * Polyfill for legacy browsers like Safari < 14 (macOS Catalina 10.15) where WebP is unsupported.
 */
export async function decodeWebpToPng(imageUrl: string): Promise<string> {
  if (decodedCache.has(imageUrl)) {
    return decodedCache.get(imageUrl)!;
  }

  const existingRequest = inFlightRequests.get(imageUrl);
  if (existingRequest) {
    return existingRequest;
  }

  const task = async () => {
    try {
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

      decodedCache.set(imageUrl, pngDataUrl);
      return pngDataUrl;
    } finally {
      inFlightRequests.delete(imageUrl);
    }
  };

  const decodePromise = task();
  inFlightRequests.set(imageUrl, decodePromise);
  return decodePromise;
}

/**
 * Returns the cached PNG data URL for a previously decoded WebP image, if available.
 */
export function getCachedDecodedWebp(imageUrl: string): string | undefined {
  return decodedCache.get(imageUrl);
}
