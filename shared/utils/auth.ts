import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "../constants";
import type { ClientIdentity } from "../types/emby";

/**
 * Builds standard Emby Authorization header format:
 * MediaBrowser Client="...", Device="...", DeviceId="...", Version="..."[, Token="..."]
 */
export function buildAuthorizationHeader(identity?: Partial<ClientIdentity>, token?: string): string {
  const parts = [
    `Client="${identity?.clientName || CLIENT_NAME}"`,
    `Device="${identity?.deviceName || DEVICE_NAME}"`,
    `DeviceId="${identity?.deviceId || "iina-emby"}"`,
    `Version="${identity?.version || CLIENT_VERSION}"`,
  ];
  if (token) {
    parts.push(`Token="${token}"`);
  }
  return `MediaBrowser ${parts.join(", ")}`;
}

/**
 * Builds standard Emby HTTP headers using the official Authorization header format.
 * Omits non-standard X-Emby-* headers to ensure compatibility with reverse proxies
 * and Cloudflare CORS Access-Control-Allow-Headers.
 */
export function buildEmbyHeaders(
  identity?: Partial<ClientIdentity>,
  token?: string,
  extraHeaders?: Record<string, string>,
): Record<string, string> {
  const auth = buildAuthorizationHeader(identity, token);

  const headers: Record<string, string> = {
    Authorization: auth,
    Accept: "application/json",
    ...(extraHeaders || {}),
  };

  return headers;
}
