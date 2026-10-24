"use strict";

// shared/constants.ts
var CLIENT_NAME = "IINA Emby Plugin";
var DEVICE_NAME = "IINA";
var CLIENT_VERSION = true ? "0.6.2" : "0.1.0";
var WINDOW_DIMENSIONS = {
  DEFAULT_WIDTH: 960,
  DEFAULT_HEIGHT: 680,
  MIN_WIDTH: 320,
  MIN_HEIGHT: 400
};
var WINDOW_PREF_KEYS = {
  WIDTH: "standalone_window_width",
  HEIGHT: "standalone_window_height"
};

// shared/utils/auth.ts
function buildAuthorizationHeader(identity, token) {
  const parts = [
    `Client="${identity?.clientName || CLIENT_NAME}"`,
    `Device="${identity?.deviceName || DEVICE_NAME}"`,
    `DeviceId="${identity?.deviceId || "iina-emby"}"`,
    `Version="${identity?.version || CLIENT_VERSION}"`
  ];
  if (token) {
    parts.push(`Token="${token}"`);
  }
  return `MediaBrowser ${parts.join(", ")}`;
}
function buildEmbyHeaders(identity, token, extraHeaders) {
  const auth = buildAuthorizationHeader(identity, token);
  const clientName = identity?.clientName || CLIENT_NAME;
  const deviceName = identity?.deviceName || DEVICE_NAME;
  const deviceId = identity?.deviceId || "iina-emby";
  const version = identity?.version || CLIENT_VERSION;
  const headers = {
    Authorization: auth,
    "X-Emby-Authorization": auth,
    "X-Emby-Client": clientName,
    "X-Emby-Device-Name": deviceName,
    "X-Emby-Device-Id": deviceId,
    "X-Emby-Client-Version": version,
    Accept: "application/json",
    ...extraHeaders || {}
  };
  if (token) {
    headers["X-Emby-Token"] = token;
  }
  return headers;
}

// shared/utils/time.ts
var TICKS_PER_SECOND = 1e7;
function ticksToSeconds(ticks) {
  if (!ticks || typeof ticks !== "number" || ticks < 0) {
    return 0;
  }
  return Math.floor(ticks / TICKS_PER_SECOND);
}
function secondsToTicks(seconds) {
  if (!seconds || typeof seconds !== "number" || seconds < 0) {
    return 0;
  }
  return Math.floor(seconds * TICKS_PER_SECOND);
}

// shared/utils/url.ts
function cleanServerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  let cleaned = rawUrl.trim();
  if (!cleaned.startsWith("http://") && !cleaned.startsWith("https://")) {
    cleaned = `http://${cleaned}`;
  }
  try {
    const parsed = new URL(cleaned);
    parsed.username = "";
    parsed.password = "";
    cleaned = parsed.origin + (parsed.pathname === "/" ? "" : parsed.pathname);
  } catch {
    cleaned = cleaned.replace(/^(https?:\/\/)[^/@]+@/i, "$1");
  }
  return cleaned.replace(/\/web(?:\/.*)?$/i, "").replace(/\/$/, "");
}

// plugin/src/lib/webview-bridge.ts
function createBridgeDeps({
  utils: utils2,
  log,
  getClientIdentity: getClientIdentity2,
  serverStore,
  onPlayMedia,
  onPlayMediaList,
  core
}) {
  return {
    core,
    utils: utils2,
    log,
    getClientIdentity: getClientIdentity2,
    getStoredEmbySession: serverStore.getStoredEmbySession,
    clearEmbySession: serverStore.clearEmbySession,
    loadStoredServers: serverStore.loadStoredServers,
    getActiveServerId: serverStore.getActiveServerId,
    setActiveServerId: serverStore.setActiveServerId,
    addOrUpdateServer: serverStore.addOrUpdateServer,
    removeServer: serverStore.removeServer,
    switchActiveServer: serverStore.switchActiveServer,
    onPlayMedia,
    onPlayMediaList
  };
}
function registerBridgeHandlers(view, deps, options) {
  view.onMessage("get-window-context", () => {
    view.postMessage("window-context", { isStandalone: Boolean(options?.isStandalone) });
  });
  view.onMessage("get-client-identity", () => {
    view.postMessage("client-identity", deps.getClientIdentity());
  });
  view.onMessage("get-session", () => {
    view.postMessage("session-data", deps.getStoredEmbySession());
  });
  view.onMessage("clear-session", () => {
    deps.clearEmbySession();
  });
  view.onMessage("store-session", (data) => {
    if (data?.serverUrl && data?.accessToken) {
      const server = deps.addOrUpdateServer({
        id: data.id,
        serverUrl: data.serverUrl,
        accessToken: data.accessToken,
        serverName: data.serverName || "",
        userId: data.userId || "",
        username: data.username || "",
        user: data.user
      });
      if (server) {
        deps.setActiveServerId(server.id);
        view.postMessage("servers-updated", {
          servers: deps.loadStoredServers(),
          activeServerId: server.id
        });
      }
    }
  });
  view.onMessage("get-servers", () => {
    const servers = deps.loadStoredServers();
    const activeServerId = deps.getActiveServerId();
    view.postMessage("servers-list", { servers, activeServerId });
  });
  view.onMessage("remove-server", (data) => {
    if (data?.serverId) {
      deps.removeServer(data.serverId);
    }
  });
  view.onMessage("switch-server", (data) => {
    if (data?.serverId) {
      deps.switchActiveServer(data.serverId);
    }
  });
  view.onMessage("open-external-url", (data) => {
    if (data?.url) {
      deps.log(`Opening external URL: ${data.url}`);
      try {
        const success = deps.utils.open(data.url);
        if (success) {
          deps.log("Successfully opened URL in browser");
          if (data.title) {
            deps.core?.osd(`Opened ${data.title} in browser`);
          } else {
            deps.core?.osd("Opened Emby page in browser");
          }
        } else {
          throw new Error("utils.open returned false");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        deps.log.error(`Failed to open external URL: ${errorMsg}`);
        deps.core?.osd("Failed to open Emby page in browser");
        deps.log.error(`URL that failed to open: ${data.url}`);
      }
    } else {
      deps.log("Invalid open-external-url message - missing URL");
    }
  });
  view.onMessage("play-media", (data) => {
    deps.onPlayMedia(data);
    if (options?.closeOnPlay && typeof view.close === "function") {
      view.close();
    }
  });
  view.onMessage("play-media-list", (data) => {
    deps.onPlayMediaList(data);
    if (options?.closeOnPlay && typeof view.close === "function") {
      view.close();
    }
  });
}

// plugin/src/lib/browser-window.ts
function createBrowserWindowManager({ core, sidebar, standaloneWindow: standaloneWindow2, preferences: preferences2, bridgeDeps: bridgeDeps2, log }) {
  let standaloneInitialized = false;
  function openEmbyStandaloneWindow2() {
    try {
      log("Opening standalone Emby browser window");
      if (!standaloneInitialized) {
        standaloneInitialized = true;
        standaloneWindow2.loadFile("dist/client/index.html");
        const savedWidth = preferences2.get(WINDOW_PREF_KEYS.WIDTH);
        const savedHeight = preferences2.get(WINDOW_PREF_KEYS.HEIGHT);
        const width = typeof savedWidth === "number" && savedWidth >= WINDOW_DIMENSIONS.MIN_WIDTH ? savedWidth : WINDOW_DIMENSIONS.DEFAULT_WIDTH;
        const height = typeof savedHeight === "number" && savedHeight >= WINDOW_DIMENSIONS.MIN_HEIGHT ? savedHeight : WINDOW_DIMENSIONS.DEFAULT_HEIGHT;
        standaloneWindow2.setFrame(width, height, null, null);
        const saWithProps = standaloneWindow2;
        if (typeof saWithProps.setProperty === "function") {
          saWithProps.setProperty({
            title: "Emby Browser",
            resizable: true,
            enableWebInspector: true
          });
        }
        standaloneWindow2.onMessage("save-window-size", (data) => {
          if (data?.width && data?.height && data.width >= WINDOW_DIMENSIONS.MIN_WIDTH && data.height >= WINDOW_DIMENSIONS.MIN_HEIGHT) {
            const w = Math.round(data.width);
            const h = Math.round(data.height);
            preferences2.set(WINDOW_PREF_KEYS.WIDTH, w);
            preferences2.set(WINDOW_PREF_KEYS.HEIGHT, h);
            preferences2.sync();
            log(`Saved standalone window size: ${w}x${h}`);
          }
        });
        registerBridgeHandlers(standaloneWindow2, bridgeDeps2, { closeOnPlay: false, isStandalone: true });
      }
      standaloneWindow2.open();
      standaloneWindow2.postMessage("window-context", { isStandalone: true });
      standaloneWindow2.postMessage("window-reopened", { timestamp: Date.now() });
      log("Standalone Emby browser window opened successfully");
      const sessionData = bridgeDeps2.getStoredEmbySession();
      if (core) {
        if (sessionData) {
          core.osd(`Emby Browser opened in standalone window
Server: ${sessionData.serverUrl.replace(/^https?:\/\//, "")}`);
        } else {
          core.osd("Emby Browser opened in standalone window\nPlease login to access your media");
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create standalone window: ${errorMsg}`);
    }
  }
  function showEmbyBrowser2() {
    log("Attempting to show Emby browser");
    let windowAvailable = false;
    if (core) {
      try {
        windowAvailable = Boolean(core.window?.loaded && core.window.visible);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Could not read window state: ${errorMsg}`);
      }
    }
    if (windowAvailable && sidebar && typeof sidebar.show === "function") {
      try {
        initSidebar();
        sidebar.show();
        sidebar.postMessage("window-reopened", { timestamp: Date.now() });
        log("Sidebar shown successfully");
        return;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Direct sidebar.show() failed: ${errorMsg}`);
      }
    } else {
      log(`No visible player window (windowAvailable=${windowAvailable}), using standalone`);
    }
    openEmbyStandaloneWindow2();
  }
  let sidebarInitialized = false;
  function initSidebar() {
    if (!sidebar || sidebarInitialized) return;
    sidebarInitialized = true;
    sidebar.loadFile("dist/client/index.html");
    registerBridgeHandlers(sidebar, bridgeDeps2, { closeOnPlay: false, isStandalone: false });
    sidebar.postMessage("window-context", { isStandalone: false });
  }
  return {
    openEmbyStandaloneWindow: openEmbyStandaloneWindow2,
    showEmbyBrowser: showEmbyBrowser2,
    initSidebar
  };
}

// plugin/src/lib/debug-log.ts
var MAX_LOG_LENGTH = 600;
var MAX_KEYS = 8;
var SECRET_QUERY_PARAM = /([?&](?:api_key|apikey|api-key|x-emby-token)=)[^&\s"']+/gi;
var SECRET_TOKEN_FIELD = /((?:token|accesstoken|api_key)"?\s*[:=]\s*"?)[A-Za-z0-9._-]{8,}/gi;
function redactSecrets(value) {
  return String(value).replace(SECRET_QUERY_PARAM, "$1[redacted]").replace(SECRET_TOKEN_FIELD, "$1[redacted]");
}
function truncateText(value, maxLength = MAX_LOG_LENGTH) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength)}\u2026[truncated ${value.length - maxLength} chars]`;
}
function serializeObject(value) {
  if (!value || typeof value !== "object") {
    return String(value);
  }
  if (value instanceof Error) {
    return `${value.name}: ${value.message}${value.stack ? `
${value.stack}` : ""}`;
  }
  if (Array.isArray(value)) {
    return `[Array(${value.length})]`;
  }
  const obj = value;
  const keys = Object.keys(obj);
  const picked = keys.slice(0, MAX_KEYS).reduce((acc, key) => {
    const item = obj[key];
    if (item === null || item === void 0 || typeof item === "number" || typeof item === "boolean") {
      acc[key] = item;
    } else if (typeof item === "string") {
      acc[key] = truncateText(item, 120);
    } else if (Array.isArray(item)) {
      acc[key] = `[Array(${item.length})]`;
    } else if (typeof item === "object") {
      acc[key] = "[Object]";
    } else {
      acc[key] = String(item);
    }
    return acc;
  }, {});
  if (keys.length > MAX_KEYS) {
    picked.__extraKeys = keys.length - MAX_KEYS;
  }
  return JSON.stringify(picked);
}
function serializeArg(arg) {
  if (arg === null || arg === void 0) {
    return String(arg);
  }
  if (typeof arg === "string") {
    return truncateText(arg);
  }
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
    return String(arg);
  }
  return truncateText(serializeObject(arg));
}
function formatMessage(prefix, parts) {
  const text = redactSecrets(parts.map(serializeArg).join(" | "));
  return `[iina-emby] ${prefix}: ${text}`;
}
var LOG_FILE_PATH = "/tmp/iina-emby.log";
function appendToFile(fileApi, text) {
  if (!fileApi) return;
  try {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().split("T")[1].slice(0, 8);
    const line = `[${timestamp}] ${text}
`;
    if (typeof fileApi.handle === "function") {
      const h = fileApi.handle(LOG_FILE_PATH, "write");
      h.seekToEnd();
      h.write(line);
    }
  } catch {
  }
}
function createDebugLogger(preferences2, loggerConsole, fileApi) {
  const isDebugEnabled = () => Boolean(preferences2?.get?.("debug_logging"));
  const debug = (...parts) => {
    if (isDebugEnabled()) {
      const msg = formatMessage("DEBUG", parts);
      appendToFile(fileApi, msg);
      loggerConsole.log(msg);
    }
  };
  const error = (...parts) => {
    const msg = formatMessage("ERROR", parts);
    if (isDebugEnabled()) {
      appendToFile(fileApi, msg);
    }
    if (typeof loggerConsole.error === "function") {
      loggerConsole.error(msg);
    } else {
      loggerConsole.log(msg);
    }
  };
  const warn = (...parts) => {
    const msg = formatMessage("WARN", parts);
    if (isDebugEnabled()) {
      appendToFile(fileApi, msg);
    }
    if (typeof loggerConsole.warn === "function") {
      loggerConsole.warn(msg);
    } else {
      loggerConsole.log(msg);
    }
  };
  const logger = (...parts) => {
    debug(...parts);
  };
  logger.debug = debug;
  logger.error = error;
  logger.warn = warn;
  return logger;
}

// plugin/src/lib/emby-api.ts
function createEmbyApi({ http: http2, preferences: preferences2, log }) {
  function getDeviceId() {
    let deviceId = preferences2.get("emby_device_id");
    if (!deviceId) {
      deviceId = `iina-emby-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      preferences2.set("emby_device_id", deviceId);
      preferences2.sync();
    }
    return deviceId;
  }
  function getClientIdentity2() {
    return {
      clientName: CLIENT_NAME,
      deviceName: DEVICE_NAME,
      deviceId: getDeviceId(),
      version: CLIENT_VERSION
    };
  }
  function buildAuthorizationHeader2(apiKey) {
    return buildAuthorizationHeader(getClientIdentity2(), apiKey);
  }
  function buildEmbyHeaders2(apiKey, extraHeaders) {
    return buildEmbyHeaders(getClientIdentity2(), apiKey, extraHeaders);
  }
  function parseEmbyUrl(url) {
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
      let apiKey = null;
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
        apiKey
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error parsing Emby URL: ${errorMsg}`);
      log(`Failed URL was: "${url}"`);
      return null;
    }
  }
  function isEmbyUrl(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }
    return url.includes("/Items/") && /[?&](?:api_key|apikey|api-key|x-emby-token)=/i.test(url) || url.toLowerCase().includes("emby") || /[?&](?:x-emby-token)=/i.test(url) || url.includes("/Audio/") || url.includes("/Videos/");
  }
  async function fetchPlaybackInfo(serverBase, itemId, apiKey) {
    try {
      const playbackUrl = `${serverBase}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}`;
      log(`Fetching playback info from: ${playbackUrl}`);
      const response = await http2.get(playbackUrl, {
        headers: buildEmbyHeaders2(apiKey, {
          Accept: "application/json"
        })
      });
      log("Response received");
      if (!response.data) {
        throw new Error("No data received from Emby API");
      }
      if (typeof response.data === "object") {
        log("Response data is already parsed object");
        log(`MediaSources found: ${response.data.MediaSources ? response.data.MediaSources.length : "none"}`);
        return response.data;
      }
      log("Response data is string, parsing manually");
      log(`Response.data preview: ${String(response.data).substring(0, 200)}`);
      return JSON.parse(response.data);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching playback info: ${errorMsg}`);
      throw error;
    }
  }
  async function fetchItemMetadata(serverBase, itemId, apiKey, userId) {
    try {
      const metadataUrl = userId ? `${serverBase}/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}` : `${serverBase}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}`;
      log(`Fetching item metadata from: ${metadataUrl}`);
      const response = await http2.get(metadataUrl, {
        headers: buildEmbyHeaders2(apiKey, {
          Accept: "application/json"
        })
      });
      log("Metadata response received");
      if (!response.data) {
        throw new Error("No metadata received from Emby API");
      }
      if (typeof response.data === "object") {
        log("Metadata is already parsed object");
        log(`Item name: ${response.data.Name}`);
        log(`Item type: ${response.data.Type}`);
        return response.data;
      }
      log("Metadata is string, parsing manually");
      log(`Metadata preview: ${String(response.data).substring(0, 200)}`);
      return JSON.parse(response.data);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching item metadata: ${errorMsg}`);
      throw error;
    }
  }
  return {
    getClientIdentity: getClientIdentity2,
    buildAuthorizationHeader: buildAuthorizationHeader2,
    buildEmbyHeaders: buildEmbyHeaders2,
    parseEmbyUrl,
    isEmbyUrl,
    fetchPlaybackInfo,
    fetchItemMetadata,
    secondsToTicks,
    ticksToSeconds
  };
}

// plugin/src/lib/server-session-store.ts
function createServerSessionStore({ preferences: preferences2, sidebar, standaloneWindow: standaloneWindow2, log }) {
  function notifyViews(name, data) {
    for (const view of [sidebar, standaloneWindow2]) {
      if (view && typeof view.postMessage === "function") {
        view.postMessage(name, data);
      }
    }
  }
  function loadStoredServers() {
    try {
      const serversJson = preferences2.get("emby_servers");
      if (!serversJson) return [];
      const servers = typeof serversJson === "string" ? JSON.parse(serversJson) : serversJson;
      if (!Array.isArray(servers)) return [];
      const usableServers = servers.filter((server) => server?.serverUrl && server.accessToken).map((server) => ({
        ...server,
        serverUrl: cleanServerUrl(server.serverUrl)
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
  function saveStoredServers(servers) {
    try {
      preferences2.set("emby_servers", JSON.stringify(servers));
      preferences2.sync();
      log(`Saved ${servers.length} server(s) to preferences`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error saving servers: ${errorMsg}`);
    }
  }
  function getActiveServerId() {
    const id = preferences2.get("emby_active_server_id");
    return id || null;
  }
  function setActiveServerId(serverId) {
    preferences2.set("emby_active_server_id", serverId || "");
    preferences2.sync();
  }
  function addOrUpdateServer(serverData) {
    try {
      const servers = loadStoredServers();
      const normalizedUrl = cleanServerUrl(serverData.serverUrl);
      const isSameUrl = (server) => server.serverUrl.replace(/\/$/, "") === normalizedUrl;
      let existingIndex = -1;
      if (serverData.id) {
        existingIndex = servers.findIndex((server) => server.id === serverData.id);
      }
      if (existingIndex < 0 && serverData.userId) {
        existingIndex = servers.findIndex((server) => isSameUrl(server) && server.userId === serverData.userId);
      }
      if (existingIndex < 0) {
        existingIndex = servers.findIndex((server) => isSameUrl(server) && !server.userId);
      }
      const serverEntry = {
        id: existingIndex >= 0 ? servers[existingIndex].id : serverData.id || `srv-${Date.now()}`,
        serverUrl: normalizedUrl,
        serverName: serverData.serverName || normalizedUrl,
        accessToken: serverData.accessToken,
        userId: serverData.userId || "",
        username: serverData.username || "",
        user: serverData.user || (existingIndex >= 0 ? servers[existingIndex].user : void 0),
        addedAt: existingIndex >= 0 ? servers[existingIndex].addedAt : Date.now(),
        updatedAt: Date.now()
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error adding/updating server: ${errorMsg}`);
      return null;
    }
  }
  function removeServer(serverId) {
    try {
      let servers = loadStoredServers();
      servers = servers.filter((server) => server.id !== serverId);
      saveStoredServers(servers);
      if (getActiveServerId() === serverId) {
        setActiveServerId(servers.length > 0 ? servers[0].id : null);
      }
      log(`Removed server: ${serverId}`);
      notifyViews("servers-updated", { servers, activeServerId: getActiveServerId() });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error removing server: ${errorMsg}`);
    }
  }
  function getActiveServer() {
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
  function switchActiveServer(serverId) {
    const servers = loadStoredServers();
    const server = servers.find((item) => item.id === serverId);
    if (server) {
      setActiveServerId(serverId);
      log(`Switched active server to: ${server.serverName}`);
      notifyViews("server-switched", { server, servers, activeServerId: serverId });
    }
  }
  function storeEmbySession(serverBase, apiKey) {
    try {
      const normalizedUrl = String(serverBase || "").replace(/\/$/, "");
      const signedIn = loadStoredServers().find((server2) => server2.userId && server2.serverUrl.replace(/\/$/, "") === normalizedUrl);
      if (signedIn) {
        log(`Server ${normalizedUrl} is already signed in as ${signedIn.username || signedIn.userId}`);
        notifyViews("session-available", {
          serverUrl: signedIn.serverUrl,
          accessToken: signedIn.accessToken,
          serverId: signedIn.id
        });
        return;
      }
      log(`Storing Emby session data for: ${serverBase}`);
      const server = addOrUpdateServer({
        serverUrl: serverBase,
        accessToken: apiKey
      });
      if (server) {
        notifyViews("session-available", {
          serverUrl: server.serverUrl,
          accessToken: server.accessToken,
          serverId: server.id
        });
      }
    } catch (error) {
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
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Error clearing Emby session: ${errorMsg}`);
    }
  }
  function getStoredEmbySession() {
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
        username: server.username
      };
    } catch (error) {
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
    getStoredEmbySession
  };
}

// plugin/src/global.ts
var { global, console, preferences, standaloneWindow, utils, http, menu, file } = iina;
var debugLog = createDebugLogger(preferences, console, file);
debugLog("Emby Plugin Global Entry loaded");
console.log("[iina-emby] Global Entry initialized");
var { getClientIdentity } = createEmbyApi({
  http,
  preferences,
  log: debugLog
});
var serverSessionStore = createServerSessionStore({
  preferences,
  standaloneWindow,
  log: debugLog
});
var activePlayerTarget = null;
global.onMessage("player-active", (data, player) => {
  debugLog("Player reported active:", { data, player });
  if (activePlayerTarget === null && player) {
    activePlayerTarget = player;
  }
});
global.onMessage("player-inactive", (data, player) => {
  debugLog("Player reported inactive (retaining player instance for reuse):", { data, player });
});
global.onMessage("player-unregistered", (_data, player) => {
  debugLog("Player instance unregistered (retaining player instance for reuse):", player);
});
global.onMessage("player-file-loaded", (data) => {
  debugLog("Player file loaded:", data);
});
global.onMessage("player-next-queued", (data) => {
  debugLog("Player queued upcoming episodes:", data);
});
global.onMessage("playback-progress-updated", (data) => {
  if (standaloneWindow && typeof standaloneWindow.postMessage === "function") {
    standaloneWindow.postMessage("playback-progress-updated", data);
  }
});
function spawnNewPlayerInstance(streamUrl, title) {
  debugLog("Creating new player instance for playback:", title);
  try {
    const playerId = global.createPlayerInstance({
      url: streamUrl,
      label: `emby-${Date.now()}`,
      enablePlugins: false,
      disableWindowAnimation: false
    });
    debugLog(`Created player instance ${playerId} for: ${title}`);
    if (typeof playerId === "number") {
      activePlayerTarget = playerId;
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    debugLog.error("Failed to create player instance: " + errorMsg);
  }
}
function handleGlobalPlayMedia(data) {
  if (!data?.streamUrl) return;
  const openInNewWindow = preferences.get("open_in_new_window");
  debugLog("Global entry handleGlobalPlayMedia:", {
    title: data.title,
    streamUrl: data.streamUrl,
    startPositionTicks: data.startPositionTicks,
    startPositionSeconds: data.startPositionSeconds,
    activePlayerTarget,
    openInNewWindow
  });
  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-command", data);
  } else {
    spawnNewPlayerInstance(data.streamUrl, data.title);
  }
}
function handleGlobalPlayMediaList(data) {
  const openInNewWindow = preferences.get("open_in_new_window");
  if (activePlayerTarget !== null && !openInNewWindow) {
    debugLog("Forwarding play-media-list to active player instance:", activePlayerTarget);
    global.postMessage(activePlayerTarget, "play-media-list-command", data);
  } else {
    const firstItem = data?.items?.[0];
    if (firstItem) {
      handleGlobalPlayMedia(firstItem);
    }
  }
}
var bridgeDeps = createBridgeDeps({
  utils,
  log: debugLog,
  getClientIdentity,
  serverStore: serverSessionStore,
  onPlayMedia: handleGlobalPlayMedia,
  onPlayMediaList: handleGlobalPlayMediaList
});
var { openEmbyStandaloneWindow, showEmbyBrowser } = createBrowserWindowManager({
  standaloneWindow,
  preferences,
  bridgeDeps,
  log: debugLog
});
global.onMessage("reopen-browser", () => {
  console.log("[iina-emby] Global entry received reopen-browser request, opening standalone browser");
  debugLog("Global entry opening standalone Emby browser");
  openEmbyStandaloneWindow();
});
menu.addItem(
  menu.item("Show Emby Browser", showEmbyBrowser, {
    keyBinding: "Meta+Shift+e"
  })
);
global.onMessage("create-player", (data, player) => {
  debugLog("Global entry received create-player message", {
    hasData: Boolean(data),
    url: data?.url,
    title: data?.title
  });
  try {
    const { url, title } = data;
    if (!url) {
      throw new Error("No URL provided in create-player data");
    }
    const playerId = global.createPlayerInstance({
      url,
      label: `emby-${Date.now()}`,
      enablePlugins: false,
      disableWindowAnimation: false
    });
    debugLog(`Created new player instance ${playerId} for: ${title}`);
    if (typeof playerId === "number") {
      activePlayerTarget = playerId;
    }
    if (player !== void 0) {
      global.postMessage(player, "player-created", {
        playerId,
        title,
        url
      });
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    debugLog.error(`Error creating player instance: ${errorMsg}`);
    if (player !== void 0) {
      global.postMessage(player, "player-creation-failed", {
        error: errorMsg,
        url: data?.url
      });
    }
  }
});
debugLog("Global entry message listeners registered");
try {
  const shouldAutoOpen = preferences.get("auto_open_on_launch") !== false;
  if (shouldAutoOpen) {
    debugLog("Auto-opening Emby standalone browser on IINA launch");
    setTimeout(() => {
      try {
        openEmbyStandaloneWindow();
      } catch (err) {
        console.error(`[iina-emby] Error auto-opening standalone window: ${err instanceof Error ? err.message : String(err)}`);
      }
    }, 500);
  }
} catch (e) {
  debugLog(`Error in auto_open_on_launch: ${e instanceof Error ? e.message : String(e)}`);
}
