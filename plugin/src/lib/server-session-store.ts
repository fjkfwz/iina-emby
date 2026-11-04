import { cleanServerUrl, type EmbyServer } from "@shared";
import type { DebugLogger } from "./debug-log";

export interface ServerSessionStoreDeps {
  preferences: typeof iina.preferences;
  sidebar?: typeof iina.sidebar;
  standaloneWindow?: typeof iina.standaloneWindow;
  log: DebugLogger;
}

export interface StoredSessionData {
  serverUrl: string;
  accessToken: string;
  serverId: string;
  serverName?: string;
  userId?: string;
  username?: string;
  password?: string;
}

export function createServerSessionStore({ preferences, sidebar, standaloneWindow, log }: ServerSessionStoreDeps) {
  function notifyViews(name: string, data?: unknown) {
    for (const view of [sidebar, standaloneWindow]) {
      if (view && typeof view.postMessage === "function") {
        view.postMessage(name, data);
      }
    }
  }

  function loadStoredServers(): EmbyServer[] {
    try {
      const serversJson = preferences.get("emby_servers") as string | EmbyServer[] | undefined;
      if (!serversJson) return [];
      const servers: EmbyServer[] = typeof serversJson === "string" ? JSON.parse(serversJson) : serversJson;
      if (!Array.isArray(servers)) return [];

      const usableServers = servers
        .filter((server) => server?.serverUrl && server.accessToken)
        .map((server) => ({
          ...server,
          serverUrl: cleanServerUrl(server.serverUrl),
        }));

      const signedInUrls = new Set(usableServers.filter((server) => server.userId).map((server) => server.serverUrl));
      const validServers = usableServers.filter((server) => server.userId || !signedInUrls.has(server.serverUrl));

      if (validServers.length !== servers.length) {
        log(`Cleaned ${servers.length - validServers.length} redundant server entries`);
        saveStoredServers(validServers);
      }
      return validServers;
    } catch {
      log("Error loading stored servers, returning empty array");
      return [];
    }
  }

  function saveStoredServers(servers: EmbyServer[]) {
    try {
      preferences.set("emby_servers", JSON.stringify(servers));
      preferences.sync();
      log(`Saved ${servers.length} server(s) to preferences`);
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error saving servers: ${errorMsg}`);
    }
  }

  function getActiveServerId(): string | null {
    const id = preferences.get("emby_active_server_id") as string | undefined;
    return id || null;
  }

  function setActiveServerId(serverId: string | null) {
    preferences.set("emby_active_server_id", serverId || "");
    preferences.sync();
  }

  function addOrUpdateServer(serverData: Partial<EmbyServer> & { serverUrl: string; accessToken: string }): EmbyServer | null {
    try {
      const servers = loadStoredServers();
      const normalizedUrl = cleanServerUrl(serverData.serverUrl);

      const isSameUrl = (server: EmbyServer) => server.serverUrl.replace(/\/$/, "") === normalizedUrl;

      let existingIndex = -1;

      // Match by explicit id (e.g. when updating an existing entry)
      if (serverData.id) {
        existingIndex = servers.findIndex((server) => server.id === serverData.id);
      }

      // Match by URL + userId (same user re-logging into same server)
      if (existingIndex < 0 && serverData.userId) {
        existingIndex = servers.findIndex((server) => isSameUrl(server) && server.userId === serverData.userId);
      }

      // Match anonymous entry on same URL (upgrade to signed-in)
      if (existingIndex < 0) {
        existingIndex = servers.findIndex((server) => isSameUrl(server) && !server.userId);
      }

      const serverEntry: EmbyServer = {
        id: existingIndex >= 0 ? servers[existingIndex].id : serverData.id || `srv-${Date.now()}`,
        serverUrl: normalizedUrl,
        serverName: serverData.serverName || normalizedUrl,
        accessToken: serverData.accessToken,
        userId: serverData.userId || "",
        username: serverData.username || "",
        password:
          serverData.password !== undefined ? serverData.password : existingIndex >= 0 ? servers[existingIndex].password : undefined,
        user: serverData.user || (existingIndex >= 0 ? servers[existingIndex].user : undefined),
        addedAt: existingIndex >= 0 ? servers[existingIndex].addedAt : Date.now(),
        updatedAt: Date.now(),
      };

      if (existingIndex >= 0) {
        servers[existingIndex] = serverEntry;
        log(`Updated existing server: ${serverEntry.serverName}`);
      } else {
        servers.push(serverEntry);
        log(`Added new server: ${serverEntry.serverName}`);
      }

      saveStoredServers(servers);

      if (servers.length === 1 || !getActiveServerId()) {
        setActiveServerId(serverEntry.id);
      }

      return serverEntry;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error adding/updating server: ${errorMsg}`);
      return null;
    }
  }

  function removeServer(serverId: string) {
    try {
      let servers = loadStoredServers();
      servers = servers.filter((server) => server.id !== serverId);
      saveStoredServers(servers);

      if (getActiveServerId() === serverId) {
        setActiveServerId(servers.length > 0 ? servers[0].id : null);
      }

      log(`Removed server: ${serverId}`);

      notifyViews("servers-updated", { servers, activeServerId: getActiveServerId() });
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error removing server: ${errorMsg}`);
    }
  }

  function getActiveServer(): EmbyServer | null {
    try {
      const servers = loadStoredServers();
      const activeId = getActiveServerId();
      if (activeId) {
        const activeServer = servers.find((server) => server.id === activeId);
        if (activeServer) return activeServer;
      }
      return servers.length > 0 ? servers[0] : null;
    } catch {
      return null;
    }
  }

  function switchActiveServer(serverId: string) {
    const servers = loadStoredServers();
    const server = servers.find((item) => item.id === serverId);
    if (server) {
      setActiveServerId(serverId);
      log(`Switched active server to: ${server.serverName}`);

      notifyViews("server-switched", { server, servers, activeServerId: serverId });
    }
  }

  function storeEmbySession(serverBase: string, apiKey: string) {
    try {
      const normalizedUrl = String(serverBase || "").replace(/\/$/, "");

      const signedIn = loadStoredServers().find((server) => server.userId && server.serverUrl.replace(/\/$/, "") === normalizedUrl);
      if (signedIn) {
        log(`Server ${normalizedUrl} is already signed in as ${signedIn.username || signedIn.userId}`);
        notifyViews("session-available", {
          serverUrl: signedIn.serverUrl,
          accessToken: signedIn.accessToken,
          serverId: signedIn.id,
        });
        return;
      }

      log(`Storing Emby session data for: ${serverBase}`);

      const server = addOrUpdateServer({
        serverUrl: serverBase,
        accessToken: apiKey,
      });

      if (server) {
        notifyViews("session-available", {
          serverUrl: server.serverUrl,
          accessToken: server.accessToken,
          serverId: server.id,
        });
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error storing Emby session: ${errorMsg}`);
    }
  }

  function clearEmbySession() {
    try {
      log("Clearing all Emby session data");
      saveStoredServers([]);
      setActiveServerId(null);

      notifyViews("session-cleared", {});
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error clearing Emby session: ${errorMsg}`);
    }
  }

  function getStoredEmbySession(): StoredSessionData | null {
    try {
      const server = getActiveServer();
      if (!server) {
        log("No stored server found");
        return null;
      }

      log(`Retrieved active server: ${server.serverName} (${server.serverUrl})`);
      return {
        serverUrl: server.serverUrl,
        accessToken: server.accessToken,
        serverId: server.id,
        serverName: server.serverName,
        userId: server.userId,
        username: server.username,
        password: server.password,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error retrieving Emby session: ${errorMsg}`);
      return null;
    }
  }

  return {
    loadStoredServers,
    saveStoredServers,
    getActiveServerId,
    setActiveServerId,
    addOrUpdateServer,
    removeServer,
    getActiveServer,
    switchActiveServer,
    storeEmbySession,
    clearEmbySession,
    getStoredEmbySession,
  };
}
