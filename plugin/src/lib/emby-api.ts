import {
  buildAuthorizationHeader as buildSharedAuthHeader,
  buildEmbyHeaders as buildSharedEmbyHeaders,
  CLIENT_NAME,
  CLIENT_VERSION,
  type ClientIdentity,
  DEVICE_NAME,
  type EmbyItemMetadata,
  type EmbyPlaybackInfo,
  type ParsedEmbyUrl,
  secondsToTicks,
  ticksToSeconds,
} from "@shared";
import type { DebugLogger } from "./debug-log";
import type { SafeHttp } from "./safe-http";

export type { ClientIdentity, EmbyItemMetadata, EmbyPlaybackInfo, ParsedEmbyUrl };

export interface EmbyApiDeps {
  http: typeof iina.http | SafeHttp;
  preferences: typeof iina.preferences;
  log: DebugLogger;
}

export function createEmbyApi({ http, preferences, log }: EmbyApiDeps) {
  function getDeviceId(): string {
    let deviceId = preferences.get("emby_device_id") as string | undefined;
    if (!deviceId) {
      deviceId = `iina-emby-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
      preferences.set("emby_device_id", deviceId);
      preferences.sync();
    }
    return deviceId;
  }

  function getClientIdentity(): ClientIdentity {
    return {
      clientName: CLIENT_NAME,
      deviceName: DEVICE_NAME,
      deviceId: getDeviceId(),
      version: CLIENT_VERSION,
    };
  }

  function buildAuthorizationHeader(apiKey?: string): string {
    return buildSharedAuthHeader(getClientIdentity(), apiKey);
  }

  function buildEmbyHeaders(apiKey?: string, extraHeaders?: Record<string, string>): Record<string, string> {
    return buildSharedEmbyHeaders(getClientIdentity(), apiKey, extraHeaders);
  }

  function parseEmbyUrl(url: string | null | undefined): ParsedEmbyUrl | null {
    try {
      log(`Attempting to parse URL: "${url}"`);

      if (!url) {
        log("URL is null or undefined");
        return null;
      }

      const protocolMatch = url.match(/^(https?):\/\/([^/]+)/);
      if (!protocolMatch) {
        log("Invalid URL format - no protocol/host found");
        return null;
      }

      const protocol = protocolMatch[1];
      const host = protocolMatch[2];

      const urlParts = url.split("?");
      const queryString = urlParts[1] || "";

      // Everything before the media route is the server base (including /emby if present)
      const baseMatch = urlParts[0].match(/^(https?:\/\/[^/]+.*?(?:\/emby)?)\/(?:Items|Videos|Audio)\//i);
      const serverBase = baseMatch ? baseMatch[1] : `${protocol}://${host}`;
      const pathname = urlParts[0].slice(serverBase.length);

      log(`Extracted serverBase: ${serverBase}`);
      log(`Extracted pathname: ${pathname}`);

      const pathMatch = pathname.match(/\/(?:Items|Videos|Audio)\/([^/]+)/);
      log(`Path match result: ${pathMatch ? pathMatch[0] : "no match"}`);

      if (!pathMatch) {
        log(`No item id found in pathname: ${pathname}`);
        return null;
      }

      const itemId = pathMatch[1];

      let apiKey: string | null = null;
      if (queryString) {
        const apiKeyMatch = queryString.match(/(?:^|&)(?:api_key|apikey|api-key|x-emby-token)=([^&]+)/i);
        if (apiKeyMatch) {
          apiKey = decodeURIComponent(apiKeyMatch[1]);
        }
      }

      log(`Extracted - itemId: ${itemId}, apiKey: ${apiKey ? "present" : "missing"}, serverBase: ${serverBase}`);

      if (!apiKey) {
        log("No API key found in URL parameters");
        return null;
      }

      return {
        serverBase,
        itemId,
        apiKey,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error parsing Emby URL: ${errorMsg}`);
      log(`Failed URL was: "${url}"`);
      return null;
    }
  }

  function isEmbyUrl(url: string | null | undefined): boolean {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }

    return (
      (url.includes("/Items/") && /[?&](?:api_key|apikey|api-key|x-emby-token)=/i.test(url)) ||
      url.toLowerCase().includes("emby") ||
      /[?&](?:x-emby-token)=/i.test(url) ||
      url.includes("/Audio/") ||
      url.includes("/Videos/")
    );
  }

  async function fetchPlaybackInfo(serverBase: string, itemId: string, apiKey: string): Promise<EmbyPlaybackInfo> {
    try {
      const playbackUrl = `${serverBase}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}`;
      log(`Fetching playback info from: ${playbackUrl}`);

      const response = await http.get(playbackUrl, {
        headers: buildEmbyHeaders(apiKey, {
          Accept: "application/json",
        }),
      });

      log("Response received");

      if (!response.data) {
        throw new Error("No data received from Emby API");
      }

      if (typeof response.data === "object") {
        log("Response data is already parsed object");
        log(`MediaSources found: ${response.data.MediaSources ? response.data.MediaSources.length : "none"}`);
        return response.data as EmbyPlaybackInfo;
      }

      log("Response data is string, parsing manually");
      log(`Response.data preview: ${String(response.data).substring(0, 200)}`);
      return JSON.parse(response.data) as EmbyPlaybackInfo;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching playback info: ${errorMsg}`);
      throw error;
    }
  }

  async function fetchItemMetadata(serverBase: string, itemId: string, apiKey: string, userId?: string): Promise<EmbyItemMetadata> {
    try {
      const metadataUrl = userId
        ? `${serverBase}/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}`
        : `${serverBase}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}`;
      log(`Fetching item metadata from: ${metadataUrl}`);

      const response = await http.get(metadataUrl, {
        headers: buildEmbyHeaders(apiKey, {
          Accept: "application/json",
        }),
      });

      log("Metadata response received");

      if (!response.data) {
        throw new Error("No metadata received from Emby API");
      }

      if (typeof response.data === "object") {
        log("Metadata is already parsed object");
        log(`Item name: ${response.data.Name}`);
        log(`Item type: ${response.data.Type}`);
        return response.data as EmbyItemMetadata;
      }

      log("Metadata is string, parsing manually");
      log(`Metadata preview: ${String(response.data).substring(0, 200)}`);
      return JSON.parse(response.data) as EmbyItemMetadata;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching item metadata: ${errorMsg}`);
      throw error;
    }
  }

  return {
    getClientIdentity,
    buildAuthorizationHeader,
    buildEmbyHeaders,
    parseEmbyUrl,
    isEmbyUrl,
    fetchPlaybackInfo,
    fetchItemMetadata,
    secondsToTicks,
    ticksToSeconds,
  };
}
