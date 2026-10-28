import {
  type EmbyServer,
  type PlaybackProgressUpdatedPayload,
  type PlayMediaListPayload,
  type PlayMediaPayload,
  type PluginPreferencesPayload,
  type TypedIinaBridge,
  WINDOW_DIMENSIONS,
} from "@shared";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { setClientIdentity } from "../lib/emby-auth-client";
import { clearLibraryCache, embyFetch } from "../lib/emby-library-client";
import { embyWebSocket } from "../lib/emby-websocket-client";
import { applyUserDataUpdatesToCache } from "../lib/user-data-sync";

declare global {
  interface Window {
    iina?: TypedIinaBridge;
  }
}

const LOCAL_STORAGE_SERVERS_KEY = "emby_saved_servers";
const LOCAL_STORAGE_ACTIVE_KEY = "emby_active_server_id";

export interface IINABridgeContextType {
  servers: EmbyServer[];
  activeServer: EmbyServer | null;
  activeServerId: string | null;
  isIinaAvailable: boolean;
  isStandalone: boolean;
  isLoading: boolean;
  reopenCount: number;
  progressUpdateCount: number;
  saveServer: (server: EmbyServer) => void;
  selectServer: (serverId: string) => void;
  removeServer: (serverId: string) => void;
  playMedia: (payload: PlayMediaPayload) => void;
  playMediaList: (payload: PlayMediaListPayload) => void;
  preferences: PluginPreferencesPayload;
  setPreference: (key: string, value: unknown) => void;
}

const IINABridgeContext = createContext<IINABridgeContextType | null>(null);

export function IINABridgeProvider({ children }: { children: React.ReactNode }) {
  const hasIina = typeof window !== "undefined" && Boolean(window?.iina?.postMessage);

  const [servers, setServers] = useState<EmbyServer[]>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_SERVERS_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [activeServerId, setActiveServerId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_ACTIVE_KEY);
    } catch {
      return null;
    }
  });

  const [isIinaAvailable, setIsIinaAvailable] = useState<boolean>(hasIina);
  const [isStandalone, setIsStandalone] = useState<boolean>(() => typeof window !== "undefined" && window.innerWidth >= 450);
  const [isLoading, setIsLoading] = useState<boolean>(() => hasIina && servers.length === 0);
  const [reopenCount, setReopenCount] = useState<number>(0);
  const [progressUpdateCount, setProgressUpdateCount] = useState<number>(0);
  const [preferences, setPreferences] = useState<PluginPreferencesPayload>(() => ({
    auto_open_on_launch: true,
    open_in_new_window: false,
    sync_playback_progress: true,
    reopen_browser_on_playback_end: true,
    autoplay_next_episode: true,
    auto_skip_outro: true,
    auto_download_enabled: true,
    debug_logging: false,
    remember_track_selections: true,
    preferred_audio_language: "zh,chi,ja,jpn,en,eng",
    preferred_audio_channel: "auto",
    preferred_subtitle_language: "zh,chi,chs,sc,cht,tc,en",
    auto_select_subtitles: true,
  }));

  const setPreference = useCallback((key: string, value: unknown) => {
    setPreferences((prev) => ({ ...prev, [key]: value }));
    if (window?.iina?.postMessage) {
      window.iina.postMessage("set-preference", { key, value });
    }
  }, []);

  const activeServer = servers.find((s) => s.id === activeServerId) || servers[0] || null;
  const activeServerRef = useRef<EmbyServer | null>(activeServer);
  activeServerRef.current = activeServer;

  // Synchronize servers and active server ID to localStorage as instant cache
  useEffect(() => {
    try {
      if (servers.length > 0) {
        localStorage.setItem(LOCAL_STORAGE_SERVERS_KEY, JSON.stringify(servers));
      }
      if (activeServerId) {
        localStorage.setItem(LOCAL_STORAGE_ACTIVE_KEY, activeServerId);
      } else if (servers.length === 0) {
        localStorage.removeItem(LOCAL_STORAGE_ACTIVE_KEY);
      }
    } catch {
      // Ignore storage quota or disabled localStorage errors
    }
  }, [servers, activeServerId]);

  // Automatically clear library cache when active server changes
  const prevActiveServerIdRef = useRef<string | null>(activeServerId);
  useEffect(() => {
    if (prevActiveServerIdRef.current !== null && prevActiveServerIdRef.current !== activeServerId) {
      clearLibraryCache();
    }
    prevActiveServerIdRef.current = activeServerId;
  }, [activeServerId]);

  // Setup IINA bridge listeners on mount
  useEffect(() => {
    setIsIinaAvailable(hasIina);

    if (hasIina && window.iina) {
      window.iina.onMessage("window-context", (data) => {
        if (data && typeof data.isStandalone === "boolean") {
          setIsStandalone(data.isStandalone);
        }
      });

      window.iina.onMessage("window-reopened", () => {
        setReopenCount((prev) => prev + 1);
      });

      window.iina.onMessage("client-identity", (identity) => {
        if (identity) {
          setClientIdentity(identity);
        }
      });

      window.iina.onMessage("servers-list", (data) => {
        if (data && Array.isArray(data.servers)) {
          setServers(data.servers);
          setActiveServerId(data.activeServerId || (data.servers[0]?.id ?? null));
        }
        setIsLoading(false);
      });

      window.iina.onMessage("servers-updated", (data) => {
        if (data && Array.isArray(data.servers)) {
          setServers(data.servers);
          if (data.activeServerId !== undefined) {
            setActiveServerId(data.activeServerId);
          }
        }
        setIsLoading(false);
      });

      window.iina.onMessage("server-switched", (data) => {
        if (data?.activeServerId) {
          setActiveServerId(data.activeServerId);
        }
        if (data && Array.isArray(data.servers)) {
          setServers(data.servers);
        }
      });

      window.iina.onMessage("session-available", (data) => {
        if (data?.serverId) {
          const nextId = data.serverId;
          setActiveServerId((prevId) => {
            if (prevId !== nextId) {
              window.iina?.postMessage("get-servers");
              return nextId;
            }
            return prevId;
          });
        }
      });

      window.iina.onMessage("session-cleared", () => {
        setServers([]);
        setActiveServerId(null);
        setIsLoading(false);
        try {
          localStorage.removeItem(LOCAL_STORAGE_SERVERS_KEY);
          localStorage.removeItem(LOCAL_STORAGE_ACTIVE_KEY);
        } catch {}
      });

      window.iina.onMessage("playback-progress-updated", (data?: PlaybackProgressUpdatedPayload) => {
        setProgressUpdateCount((prev) => prev + 1);
        if (!data?.itemId || typeof data.positionTicks !== "number") return;
        const currentServer = activeServerRef.current;
        if (!currentServer?.id) return;

        applyUserDataUpdatesToCache(currentServer.id, [
          {
            ItemId: data.itemId,
            PlaybackPositionTicks: data.positionTicks,
          },
        ]);

        // Sync playback progress safely to Emby server from WebView
        const endpoint =
          data.event === "start" ? "/Sessions/Playing" : data.event === "stop" ? "/Sessions/Playing/Stopped" : "/Sessions/Playing/Progress";

        const url = `${currentServer.serverUrl}${endpoint}?api_key=${currentServer.accessToken}`;
        const bodyData: Record<string, unknown> = {
          ItemId: data.itemId,
          MediaSourceId: data.itemId,
          PlaySessionId: data.playSessionId || undefined,
          PositionTicks: data.positionTicks,
          IsPaused: data.isPaused,
          CanSeek: true,
          PlayMethod: "DirectPlay",
        };
        if (typeof data.audioStreamIndex === "number" && data.audioStreamIndex >= 0) {
          bodyData.AudioStreamIndex = data.audioStreamIndex;
        }
        if (typeof data.subtitleStreamIndex === "number") {
          bodyData.SubtitleStreamIndex = data.subtitleStreamIndex;
        }

        embyFetch(currentServer, url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(bodyData),
        }).catch((err) => {
          console.debug("[PlaybackProgressSync] WebView embyFetch error:", err);
        });
      });

      window.iina.onMessage("preferences-data", (data?: PluginPreferencesPayload) => {
        if (data && typeof data === "object") {
          setPreferences((prev) => ({ ...prev, ...data }));
        }
      });

      // Request window context, identity, servers list, and preferences on mount
      window.iina.postMessage("get-window-context");
      window.iina.postMessage("get-client-identity");
      window.iina.postMessage("get-servers");
      window.iina.postMessage("get-preferences");

      // Retry get-servers after a short tick in case the bridge message listener was registering
      const retryTimer = setTimeout(() => {
        window.iina?.postMessage("get-servers");
      }, 400);

      // Timeout fallback to stop loading state if IINA takes too long
      const timer = setTimeout(() => {
        setIsLoading(false);
      }, 2000);

      return () => {
        clearTimeout(retryTimer);
        clearTimeout(timer);
      };
    }

    setIsLoading(false);
  }, [hasIina]);

  // Persist standalone window size changes
  useEffect(() => {
    if (!isIinaAvailable || !isStandalone || typeof window === "undefined") {
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    const handleResize = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const width = window.outerWidth || window.innerWidth;
        const height = window.outerHeight || window.innerHeight;
        if (width >= WINDOW_DIMENSIONS.MIN_WIDTH && height >= WINDOW_DIMENSIONS.MIN_HEIGHT && window.iina?.postMessage) {
          window.iina.postMessage("save-window-size", { width, height });
        }
      }, 500);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("resize", handleResize);
    };
  }, [isIinaAvailable, isStandalone]);

  // Enable window dragging for frameless standalone window
  useEffect(() => {
    if (!isIinaAvailable || !isStandalone || typeof window === "undefined") {
      return;
    }

    let isDragging = false;
    let lastMouseX = 0;
    let lastMouseY = 0;
    let animFrameId: number | null = null;
    let accumulatedDx = 0;
    let accumulatedDy = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;

      // Do NOT drag if interacting with controls, inputs, buttons, links, etc.
      if (target.closest('button, input, select, textarea, a, [data-no-drag], [role="button"], [tabindex]:not([tabindex="-1"])')) {
        return;
      }

      // Check if clicked inside header or window drag region
      const dragRegion = target.closest("header, [data-window-drag]");
      if (!dragRegion) return;

      isDragging = true;
      lastMouseX = e.screenX;
      lastMouseY = e.screenY;
      accumulatedDx = 0;
      accumulatedDy = 0;

      document.body.style.userSelect = "none";
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const dx = e.screenX - lastMouseX;
      const dy = e.screenY - lastMouseY;
      lastMouseX = e.screenX;
      lastMouseY = e.screenY;

      accumulatedDx += dx;
      accumulatedDy += dy;

      if (animFrameId === null) {
        animFrameId = window.requestAnimationFrame(() => {
          animFrameId = null;
          if (accumulatedDx !== 0 || accumulatedDy !== 0) {
            const sendDx = accumulatedDx;
            const sendDy = accumulatedDy;
            accumulatedDx = 0;
            accumulatedDy = 0;
            if (window.iina?.postMessage) {
              window.iina.postMessage("move-window", { dx: sendDx, dy: sendDy });
            }
          }
        });
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.userSelect = "";
        if (animFrameId !== null) {
          window.cancelAnimationFrame(animFrameId);
          animFrameId = null;
        }
        if (accumulatedDx !== 0 || accumulatedDy !== 0) {
          const sendDx = accumulatedDx;
          const sendDy = accumulatedDy;
          accumulatedDx = 0;
          accumulatedDy = 0;
          if (window.iina?.postMessage) {
            window.iina.postMessage("move-window", { dx: sendDx, dy: sendDy });
          }
        }
      }
    };

    window.addEventListener("mousedown", handleMouseDown, { capture: true });
    window.addEventListener("mousemove", handleMouseMove, { passive: true });
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousedown", handleMouseDown, { capture: true });
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isIinaAvailable, isStandalone]);

  const saveServer = useCallback((server: EmbyServer) => {
    setServers((prev) => {
      const idx = prev.findIndex((s) => {
        if (s.id === server.id) return true;
        if (server.userId && s.userId) {
          return s.serverUrl.replace(/\/$/, "") === server.serverUrl.replace(/\/$/, "") && s.userId === server.userId;
        }
        return false;
      });
      return idx >= 0 ? [...prev.slice(0, idx), server, ...prev.slice(idx + 1)] : [...prev, server];
    });
    setActiveServerId(server.id);

    if (window?.iina?.postMessage) {
      window.iina.postMessage("store-session", {
        id: server.id,
        serverUrl: server.serverUrl,
        accessToken: server.accessToken,
        serverName: server.serverName,
        userId: server.userId,
        username: server.username,
        user: server.user,
      });
    }
  }, []);

  const selectServer = useCallback((serverId: string) => {
    setActiveServerId(serverId);
    if (window?.iina?.postMessage) {
      window.iina.postMessage("switch-server", { serverId });
    }
  }, []);

  const removeServer = useCallback((serverId: string) => {
    setServers((prev) => {
      const updated = prev.filter((s) => s.id !== serverId);
      setActiveServerId((prevActive) => (prevActive === serverId ? (updated[0]?.id ?? null) : prevActive));
      return updated;
    });

    if (window?.iina?.postMessage) {
      window.iina.postMessage("remove-server", { serverId });
    }
  }, []);

  const playMedia = useCallback((payload: PlayMediaPayload) => {
    if (window?.iina?.postMessage) {
      window.iina.postMessage("play-media", payload);
    } else {
      console.log("[Dev Playback] play-media:", payload);
    }
  }, []);

  const playMediaList = useCallback((payload: PlayMediaListPayload) => {
    if (window?.iina?.postMessage) {
      window.iina.postMessage("play-media-list", payload);
    } else {
      console.log("[Dev Playback] play-media-list:", payload);
    }
  }, []);

  useEffect(() => {
    embyWebSocket.connect(activeServer);
  }, [activeServer?.id, activeServer?.serverUrl, activeServer?.accessToken]);

  const isFirstMountRef = useRef(true);
  useEffect(() => {
    if (isFirstMountRef.current) {
      isFirstMountRef.current = false;
      return;
    }
    if (activeServer && !embyWebSocket.isConnected()) {
      embyWebSocket.connect(activeServer);
    }
  }, [reopenCount, activeServer]);

  const value: IINABridgeContextType = {
    servers,
    activeServer,
    activeServerId,
    isIinaAvailable,
    isStandalone,
    isLoading,
    reopenCount,
    progressUpdateCount,
    saveServer,
    selectServer,
    removeServer,
    playMedia,
    playMediaList,
    preferences,
    setPreference,
  };

  return <IINABridgeContext.Provider value={value}>{children}</IINABridgeContext.Provider>;
}

export function useIINABridge(): IINABridgeContextType {
  const context = useContext(IINABridgeContext);
  if (!context) {
    throw new Error("useIINABridge must be used within an IINABridgeProvider");
  }
  return context;
}

export function useOnWindowReopen(callback: () => void) {
  const { reopenCount } = useIINABridge();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    callbackRef.current();
  }, [reopenCount]);
}

export function useOnPlaybackProgressUpdated(callback: () => void) {
  const { progressUpdateCount } = useIINABridge();
  const callbackRef = useRef(callback);
  callbackRef.current = callback;
  const isFirstMount = useRef(true);

  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      return;
    }
    callbackRef.current();
  }, [progressUpdateCount]);
}
