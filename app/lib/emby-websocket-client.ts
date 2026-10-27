import type { EmbyServer } from "@shared";
import { clearLibraryCache } from "./emby-library-client";
import { queryClient } from "./query-client";
import { embyKeys } from "./query-keys";
import { applyUserDataUpdatesToCache } from "./user-data-sync";

export interface LibraryChangedData {
  ItemsAdded?: string[];
  ItemsUpdated?: string[];
  ItemsRemoved?: string[];
  FoldersAddedTo?: string[];
  FoldersRemovedFrom?: string[];
  CollectionFolders?: string[];
  [key: string]: unknown;
}

export interface UserDataChangedItem {
  ItemId: string;
  Played?: boolean;
  PlaybackPositionTicks?: number;
  PlayCount?: number;
  IsFavorite?: boolean;
  UnplayedItemCount?: number;
  [key: string]: unknown;
}

export interface UserDataChangedData {
  UserId?: string;
  UserDataList?: UserDataChangedItem[];
  [key: string]: unknown;
}

export interface EmbyWebSocketMessage<T = unknown> {
  MessageType: string;
  Data?: T;
  MessageId?: string;
}

export type MessageListener = (message: EmbyWebSocketMessage) => void;
export type LibraryChangedListener = (data: LibraryChangedData) => void;
export type UserDataChangedListener = (data: UserDataChangedData) => void;
export type ItemUpdatedListener = (itemId: string) => void;

/**
 * Constructs the Emby WebSocket URL for a given server.
 */
export function buildWebSocketUrl(server: EmbyServer, deviceId = "iina-emby-react"): string {
  const parsed = new URL(server.serverUrl);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  const basePath = parsed.pathname.replace(/\/+$/, "");
  parsed.pathname = `${basePath}/embywebsocket`;
  parsed.searchParams.set("api_key", server.accessToken);
  parsed.searchParams.set("deviceId", deviceId);
  return parsed.toString();
}

class EmbyWebSocketManager {
  private socket: WebSocket | null = null;
  private currentServer: EmbyServer | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectAttempt = 0;
  private isExplicitlyClosed = false;
  private lastMessageTime = Date.now();
  private isAwakeListenerAttached = false;

  private messageListeners = new Set<MessageListener>();
  private libraryChangedListeners = new Set<LibraryChangedListener>();
  private userDataChangedListeners = new Set<UserDataChangedListener>();
  private itemListeners = new Map<string, Set<() => void>>();

  private attachSystemListeners(): void {
    if (this.isAwakeListenerAttached || typeof window === "undefined") return;
    this.isAwakeListenerAttached = true;

    const handleWake = () => {
      if (this.isExplicitlyClosed || !this.currentServer) return;
      const isStale = Date.now() - this.lastMessageTime > 45_000;
      const isDead = !this.socket || this.socket.readyState !== WebSocket.OPEN;
      if (isStale || isDead) {
        console.log("[EmbyWS] System woke up or came online with stale socket, refreshing connection...");
        this.reconnect();
      }
    };

    window.addEventListener("online", handleWake);
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
          handleWake();
        }
      });
    }
  }

  /**
   * Connects to the given server or reconnects if the server changed.
   */
  public connect(server: EmbyServer | null): void {
    this.attachSystemListeners();
    if (!server) {
      this.disconnect();
      return;
    }

    try {
      const nextUrl = buildWebSocketUrl(server);
      const currentUrl = this.currentServer ? buildWebSocketUrl(this.currentServer) : null;

      if (
        currentUrl === nextUrl &&
        this.socket &&
        (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING)
      ) {
        this.currentServer = server;
        return;
      }
    } catch {
      // Fallback to disconnect and init if URL parsing fails
    }

    this.disconnect();
    this.currentServer = server;
    this.isExplicitlyClosed = false;
    this.reconnectAttempt = 0;
    this.initSocket();
  }

  /**
   * Disconnects current socket and clears state.
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      const s = this.socket;
      this.socket = null;
      try {
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        const isConnecting = s.readyState === (typeof WebSocket !== "undefined" ? WebSocket.CONNECTING : 0);
        if (isConnecting) {
          s.onopen = () => {
            try {
              s.close(1000, "Normal Closure");
            } catch {
              // Ignore close errors
            }
          };
        } else {
          s.onopen = null;
          s.close(1000, "Normal Closure");
        }
      } catch {
        // Ignore close errors
      }
    }
    this.currentServer = null;
    this.reconnectAttempt = 0;
  }

  /**
   * Check whether the WebSocket is currently open.
   */
  public isConnected(): boolean {
    return Boolean(this.socket && this.socket.readyState === WebSocket.OPEN);
  }

  /**
   * Subscribe to all incoming WebSocket messages.
   */
  public onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => {
      this.messageListeners.delete(listener);
    };
  }

  /**
   * Subscribe to LibraryChanged events.
   */
  public onLibraryChanged(listener: LibraryChangedListener): () => void {
    this.libraryChangedListeners.add(listener);
    return () => {
      this.libraryChangedListeners.delete(listener);
    };
  }

  /**
   * Subscribe to UserDataChanged events.
   */
  public onUserDataChanged(listener: UserDataChangedListener): () => void {
    this.userDataChangedListeners.add(listener);
    return () => {
      this.userDataChangedListeners.delete(listener);
    };
  }

  /**
   * Subscribe to updates for a specific Item ID.
   * Triggers whenever LibraryChanged includes this item in ItemsUpdated or ItemsAdded,
   * or when UserDataChanged includes this item.
   */
  public onItemUpdated(itemId: string, callback: () => void): () => void {
    let listeners = this.itemListeners.get(itemId);
    if (!listeners) {
      listeners = new Set();
      this.itemListeners.set(itemId, listeners);
    }
    listeners.add(callback);

    return () => {
      const set = this.itemListeners.get(itemId);
      if (set) {
        set.delete(callback);
        if (set.size === 0) {
          this.itemListeners.delete(itemId);
        }
      }
    };
  }

  private initSocket(): void {
    if (!this.currentServer || this.isExplicitlyClosed) return;

    try {
      const wsUrl = buildWebSocketUrl(this.currentServer);
      const ws = new WebSocket(wsUrl);
      this.socket = ws;

      ws.onopen = () => {
        if (this.socket !== ws) return;
        this.reconnectAttempt = 0;
        console.log("[EmbyWS] Connected to", wsUrl.split("?")[0]);
        this.startPing();

        // Subscribe to live Emby events
        this.sendMessage({ MessageType: "LibraryChangedStart" });
        this.sendMessage({ MessageType: "UserDataChangedStart" });
      };

      ws.onmessage = (event) => {
        console.log("%c%s", "color: purple", `[EmbyWS:RAW] ${new Date().toISOString().slice(11, 23)}, ${event.data}`);
        if (this.socket !== ws) return;
        this.handleMessage(event.data);
      };

      ws.onerror = (error) => {
        if (this.socket !== ws) return;
        console.warn("[EmbyWS] WebSocket network notice:", error);
      };

      ws.onclose = () => {
        if (this.socket !== ws) return;
        this.socket = null;
        this.stopPing();
        if (!this.isExplicitlyClosed) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.warn("[EmbyWS] Failed to initialize WebSocket:", err);
      this.scheduleReconnect();
    }
  }

  public reconnect(): void {
    if (!this.currentServer || this.isExplicitlyClosed) return;
    this.stopPing();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        const s = this.socket;
        this.socket = null;
        s.onmessage = null;
        s.onerror = null;
        s.onclose = null;
        s.close(1000, "Reconnecting");
      } catch {
        // Ignore close error
      }
    }
    this.initSocket();
  }

  private startPing(): void {
    this.stopPing();
    this.lastMessageTime = Date.now();
    this.pingTimer = setInterval(() => {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        return;
      }
      // Dead-man watchdog: if no frame received for 60 seconds (half-open socket), force reconnect
      if (Date.now() - this.lastMessageTime > 60_000) {
        console.warn("[EmbyWS] Dead-man timeout: no messages for 60s, reconnecting...");
        this.reconnect();
        return;
      }
      this.sendMessage({ MessageType: "KeepAlive" });
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private sendMessage(msg: Record<string, unknown>): void {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      try {
        this.socket.send(JSON.stringify(msg));
      } catch (err) {
        console.warn("[EmbyWS] Failed to send message:", err);
      }
    }
  }

  private handleMessage(rawData: unknown): void {
    this.lastMessageTime = Date.now();
    if (typeof rawData !== "string") return;

    try {
      const parsed = JSON.parse(rawData) as EmbyWebSocketMessage;

      // Reply to server KeepAlive
      if (parsed.MessageType === "KeepAlive") {
        this.sendMessage({ MessageType: "KeepAlive" });
        return;
      }

      console.log("[EmbyWS:Message]", parsed.MessageType, parsed.Data);

      // Notify raw message listeners
      for (const listener of this.messageListeners) {
        try {
          listener(parsed);
        } catch (err) {
          console.error("[EmbyWS] Error in message listener:", err);
        }
      }

      // Handle LibraryChanged
      if (parsed.MessageType === "LibraryChanged") {
        const data = (parsed.Data || {}) as LibraryChangedData;
        clearLibraryCache();
        console.log(`[EmbyWS] Dispatching LibraryChanged to ${this.libraryChangedListeners.size} listener(s):`, data);

        const serverId = this.currentServer?.id;
        const affectedIds = new Set<string>([...(data.ItemsAdded || []), ...(data.ItemsUpdated || []), ...(data.ItemsRemoved || [])]);

        // TanStack Query prefix matching invalidates all item, section, shelf, and view queries for this server
        if (serverId) {
          queryClient.invalidateQueries({ queryKey: embyKeys.server(serverId) });
        } else {
          queryClient.invalidateQueries({ queryKey: embyKeys.all });
        }
        console.log(`[EmbyWS] Invalidation dispatched for server ${serverId ?? "all"} (${affectedIds.size} affected item(s))`);

        for (const listener of this.libraryChangedListeners) {
          try {
            listener(data);
          } catch (err) {
            console.error("[EmbyWS] Error in libraryChanged listener:", err);
          }
        }

        // Notify specific item listeners if matched
        for (const id of affectedIds) {
          const listeners = this.itemListeners.get(id);
          if (listeners) {
            console.log(`[EmbyWS] Notifying ${listeners.size} listener(s) for item ${id}`);
            for (const cb of listeners) {
              try {
                cb();
              } catch (err) {
                console.error("[EmbyWS] Error in item listener:", err);
              }
            }
          }
        }
      }

      // Handle UserDataChanged
      if (parsed.MessageType === "UserDataChanged") {
        const data = (parsed.Data || {}) as UserDataChangedData;
        clearLibraryCache();
        console.log(`[EmbyWS] Dispatching UserDataChanged to ${this.userDataChangedListeners.size} listener(s):`, data);

        const serverId = this.currentServer?.id;
        if (serverId && Array.isArray(data.UserDataList) && data.UserDataList.length > 0) {
          applyUserDataUpdatesToCache(serverId, data.UserDataList);
          console.log(`[EmbyWS] Applied in-memory UserData updates for ${data.UserDataList.length} item(s)`);
        } else if (serverId) {
          queryClient.invalidateQueries({ queryKey: embyKeys.server(serverId) });
        } else {
          queryClient.invalidateQueries({ queryKey: embyKeys.all });
        }

        for (const listener of this.userDataChangedListeners) {
          try {
            listener(data);
          } catch (err) {
            console.error("[EmbyWS] Error in userDataChanged listener:", err);
          }
        }

        // Notify items whose user data changed
        if (Array.isArray(data.UserDataList)) {
          for (const entry of data.UserDataList) {
            if (entry.ItemId) {
              const listeners = this.itemListeners.get(entry.ItemId);
              if (listeners) {
                console.log(`[EmbyWS] Notifying ${listeners.size} listener(s) for user data item ${entry.ItemId}`);
                for (const cb of listeners) {
                  try {
                    cb();
                  } catch (err) {
                    console.error("[EmbyWS] Error in item user data listener:", err);
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore unparseable frames
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isExplicitlyClosed || !this.currentServer) return;

    this.reconnectAttempt += 1;
    // Exponential backoff: 2s, 4s, 8s, max 15s
    const delayMs = Math.min(15_000, 2000 * 2 ** (this.reconnectAttempt - 1));

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isExplicitlyClosed && this.currentServer) {
        this.initSocket();
      }
    }, delayMs);
  }
}

export const embyWebSocket = new EmbyWebSocketManager();

export const onServerMessage = (listener: MessageListener) => embyWebSocket.onMessage(listener);
export const onLibraryChanged = (listener: LibraryChangedListener) => embyWebSocket.onLibraryChanged(listener);
export const onUserDataChanged = (listener: UserDataChangedListener) => embyWebSocket.onUserDataChanged(listener);
export const onItemUpdated = (itemId: string, callback: () => void) => embyWebSocket.onItemUpdated(itemId, callback);
