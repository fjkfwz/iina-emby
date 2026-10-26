import type { ClientIdentity, EmbyServer } from "./emby";

export interface StoredSessionPayload {
  serverUrl: string;
  accessToken: string;
  serverId?: string;
  serverName?: string;
  userId?: string;
  username?: string;
}

export interface ServersListPayload {
  servers: EmbyServer[];
  activeServerId: string | null;
}

export interface PlayMediaPayload {
  streamUrl: string;
  title?: string;
  startPositionTicks?: number;
  startPositionSeconds?: number;
  selectedAudioIndex?: number;
  selectedSubtitleIndex?: number;
  audioTrackNumber?: number;
  subtitleTrackNumber?: number;
  audioLanguage?: string;
  subtitleLanguage?: string;
  isExternalSubtitle?: boolean;
  subtitlePath?: string;
  subtitleCodec?: string;
  mediaSourceId?: string;
  subtitleDeliveryUrl?: string;
  [key: string]: unknown;
}

export interface PlayMediaListPayload {
  items: PlayMediaPayload[];
  [key: string]: unknown;
}

export interface StoreSessionPayload {
  id?: string;
  serverUrl: string;
  accessToken: string;
  serverName?: string;
  userId?: string;
  username?: string;
  user?: EmbyServer["user"];
  [key: string]: unknown;
}

export interface ServerIdPayload {
  serverId: string;
  [key: string]: unknown;
}

export interface OpenExternalUrlPayload {
  url: string;
  title?: string;
  [key: string]: unknown;
}

export interface WindowSizePayload {
  width: number;
  height: number;
}

export interface WindowContextPayload {
  isStandalone: boolean;
}

export interface WindowReopenedPayload {
  timestamp?: number;
}

export interface PlaybackProgressUpdatedPayload {
  itemId: string;
  positionTicks: number;
  isPaused: boolean;
  event?: "start" | "progress" | "stop";
  playSessionId?: string | null;
}

export interface ServerSwitchedPayload {
  server: EmbyServer;
  servers: EmbyServer[];
  activeServerId: string;
}

export interface PluginPreferencesPayload {
  auto_open_on_launch?: boolean;
  open_in_new_window?: boolean;
  sync_playback_progress?: boolean;
  reopen_browser_on_playback_end?: boolean;
  autoplay_next_episode?: boolean;
  auto_download_enabled?: boolean;
  debug_logging?: boolean;
  [key: string]: unknown;
}

export interface SetPreferencePayload {
  key: string;
  value: unknown;
}

/**
 * Messages sent from IINA plugin to WebView (inbound to React)
 */
export interface BridgeInboundMap {
  "client-identity": ClientIdentity;
  "servers-list": ServersListPayload;
  "servers-updated": ServersListPayload;
  "server-switched": ServerSwitchedPayload;
  "session-data": StoredSessionPayload | null;
  "session-available": StoredSessionPayload;
  "session-cleared": Record<string, never>;
  "window-context": WindowContextPayload;
  "window-reopened": WindowReopenedPayload;
  "playback-progress-updated": PlaybackProgressUpdatedPayload;
  "preferences-data": PluginPreferencesPayload;
}

/**
 * Messages sent from WebView to IINA plugin (outbound from React)
 */
export interface BridgeOutboundMap {
  "get-window-context": undefined;
  "get-client-identity": undefined;
  "get-preferences": undefined;
  "set-preference": SetPreferencePayload;
  "get-servers": undefined;
  "get-session": undefined;
  "clear-session": undefined;
  "store-session": StoreSessionPayload;
  "switch-server": ServerIdPayload;
  "remove-server": ServerIdPayload;
  "play-media": PlayMediaPayload;
  "play-media-list": PlayMediaListPayload;
  "open-external-url": OpenExternalUrlPayload;
  "save-window-size": WindowSizePayload;
  "move-window": { dx?: number; dy?: number; x?: number; y?: number };
}

export interface TypedIinaBridge {
  postMessage<K extends keyof BridgeOutboundMap>(
    name: K,
    ...args: BridgeOutboundMap[K] extends undefined ? [data?: undefined] : [data: BridgeOutboundMap[K]]
  ): void;
  postMessage(name: string, data?: unknown): void;

  onMessage<K extends keyof BridgeInboundMap>(name: K, callback: (data: BridgeInboundMap[K]) => void): void;
  onMessage(name: string, callback: (data: unknown) => void): void;
}
