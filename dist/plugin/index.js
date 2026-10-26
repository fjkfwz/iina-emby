"use strict";

// shared/constants.ts
var CLIENT_NAME = "IINA Emby Plugin";
var DEVICE_NAME = "IINA";
var CLIENT_VERSION = true ? "0.7.0" : "0.1.0";

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
  const headers = {
    Authorization: auth,
    Accept: "application/json",
    ...extraHeaders || {}
  };
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
function formatEpisodeCode(seasonNum, episodeNum) {
  const s = typeof seasonNum === "number" && seasonNum > 0 ? String(seasonNum).padStart(2, "0") : "01";
  const e = typeof episodeNum === "number" && episodeNum > 0 ? String(episodeNum).padStart(2, "0") : "01";
  return `S${s}E${e}`;
}
function formatFullEpisodeTitle(seriesName, seasonNum, episodeNum, episodeName) {
  const code = formatEpisodeCode(seasonNum, episodeNum);
  const title = episodeName || "Episode";
  return seriesName ? `${seriesName} ${code} - ${title}` : `${code} - ${title}`;
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
function isSameEmbyHost(left, right) {
  const hostOf = (url) => String(url || "").replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  const leftHost = hostOf(left);
  return leftHost.length > 0 && leftHost === hostOf(right);
}
function sanitizeStreamUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return rawUrl;
  let cleaned = rawUrl.trim();
  try {
    const parsed = new URL(cleaned);
    parsed.username = "";
    parsed.password = "";
    cleaned = parsed.toString();
  } catch {
    cleaned = cleaned.replace(/^(https?:\/\/)[^/@]+@/i, "$1");
  }
  cleaned = cleaned.replace(/([?&])ApiKey=/i, "$1api_key=");
  return cleaned;
}

// shared/utils/webp-decoder.ts
var decodeQueue = Promise.resolve();

// plugin/src/lib/autoplay-manager.ts
function createAutoplayManager({
  http: http2,
  mpv: mpv2,
  core: core2,
  preferences: preferences2,
  file: file2,
  utils: utils2,
  global: iinaGlobal2,
  isClosing,
  buildEmbyHeaders: buildEmbyHeaders3,
  fetchItemMetadata: fetchItemMetadata2,
  log
}) {
  let lastProcessedEpisodeId = null;
  let lastProcessedSeriesId = null;
  let autoplayRequestCounter = 0;
  let autoplayQueued = false;
  async function fetchSeriesEpisodes(serverBase, seriesId, seasonId, apiKey, userId) {
    try {
      log(`Fetching episodes for series: ${seriesId}, season: ${seasonId}, userId: ${userId || "none"}`);
      const queryParams = [
        `seasonId=${encodeURIComponent(seasonId)}`,
        `fields=${encodeURIComponent("MediaSources,Path,LocationType,IsFolder")}`,
        ...userId ? [`userId=${encodeURIComponent(userId)}`] : []
      ].join("&");
      const response = await http2.get(`${serverBase}/Shows/${seriesId}/Episodes?${queryParams}&api_key=${apiKey}`, {
        headers: buildEmbyHeaders3(apiKey, {
          Accept: "application/json"
        })
      });
      if (!response.data) {
        throw new Error("No data received from Emby API");
      }
      const episodeData = typeof response.data === "string" ? JSON.parse(response.data) : response.data;
      if (!episodeData?.Items) {
        log("No episodes found in response");
        return [];
      }
      const episodes = episodeData.Items.filter(
        (episode) => Boolean(episode.MediaSources && episode.MediaSources.length > 0 && episode.Id)
      ).map((episode) => ({
        id: episode.Id,
        name: episode.Name || "",
        indexNumber: Number(episode.IndexNumber) || 0,
        duration: episode.RunTimeTicks,
        playUrl: `${serverBase}/Videos/${episode.Id}/stream?static=true&api_key=${apiKey}`
      }));
      episodes.sort((left, right) => left.indexNumber - right.indexNumber);
      log(`Fetched ${episodes.length} episodes from series: ${episodes.map((episode) => `E${episode.indexNumber}`).join(", ")}`);
      return episodes;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching series episodes: ${errorMsg}`);
      return [];
    }
  }
  async function getSeriesInfoFromEpisode(serverBase, episodeId, apiKey, userId) {
    try {
      log(`Getting series info from episode: ${episodeId}, userId: ${userId || "none"}`);
      const metadata = await fetchItemMetadata2(serverBase, episodeId, apiKey, userId);
      if (metadata.Type !== "Episode") {
        log(`Item ${episodeId} is not an episode, it's a ${metadata.Type}`);
        return null;
      }
      const seriesId = metadata.SeriesId;
      const seasonId = metadata.SeasonId;
      const seriesName = metadata.SeriesName || "";
      const parsedSeasonNumber = Number(metadata.ParentIndexNumber ?? 1);
      const seasonNumber = Number.isFinite(parsedSeasonNumber) ? parsedSeasonNumber : 1;
      const episodeIndexNumber = Number(metadata.IndexNumber) || 0;
      if (!seriesId || !seasonId) {
        log(`Missing series info - SeriesId: ${seriesId}, SeasonId: ${seasonId}`);
        return null;
      }
      log(
        `Series info: SeriesName=${seriesName}, SeriesId=${seriesId}, SeasonId=${seasonId}, SeasonNumber=${seasonNumber}, EpisodeNumber=${episodeIndexNumber}`
      );
      return {
        seriesId,
        seasonId,
        seriesName,
        seasonNumber,
        currentEpisodeNumber: episodeIndexNumber
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error getting series info from episode: ${errorMsg}`);
      return null;
    }
  }
  async function resolveRemainingEpisodes(serverBase, seriesId, seasonId, currentEpisodeNumber, apiKey, userId) {
    try {
      const episodes = await fetchSeriesEpisodes(serverBase, seriesId, seasonId, apiKey, userId);
      const currentEpNum = Number(currentEpisodeNumber);
      const remainingEpisodes = episodes.filter((episode) => episode.indexNumber > currentEpNum);
      if (remainingEpisodes.length > 0) {
        log(`Found ${remainingEpisodes.length} remaining episode(s) in current season`);
        return remainingEpisodes;
      }
      log("No remaining episodes in current season, checking next season...");
      const seasonsUrl = userId ? `${serverBase}/Shows/${seriesId}/Seasons?userId=${encodeURIComponent(userId)}&api_key=${apiKey}` : `${serverBase}/Shows/${seriesId}/Seasons?api_key=${apiKey}`;
      const seasonsResponse = await http2.get(seasonsUrl, {
        headers: buildEmbyHeaders3(apiKey, { Accept: "application/json" })
      });
      if (!seasonsResponse.data) return [];
      const seasonsData = typeof seasonsResponse.data === "string" ? JSON.parse(seasonsResponse.data) : seasonsResponse.data;
      if (!seasonsData?.Items || seasonsData.Items.length === 0) return [];
      const sortedSeasons = seasonsData.Items.filter(
        (season) => season.IndexNumber !== null && season.IndexNumber !== void 0
      ).sort((left, right) => (left.IndexNumber || 0) - (right.IndexNumber || 0));
      const currentSeasonIndex = sortedSeasons.findIndex((season) => season.Id === seasonId);
      if (currentSeasonIndex === -1 || currentSeasonIndex >= sortedSeasons.length - 1) {
        log("No next season available \u2014 end of series");
        return [];
      }
      const nextSeason = sortedSeasons[currentSeasonIndex + 1];
      log(`Found next season: ${nextSeason.Name} (S${nextSeason.IndexNumber})`);
      const nextSeasonEpisodes = await fetchSeriesEpisodes(serverBase, seriesId, nextSeason.Id, apiKey, userId);
      for (const ep of nextSeasonEpisodes) {
        ep.seasonNumber = nextSeason.IndexNumber;
      }
      return nextSeasonEpisodes;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error resolving remaining episodes: ${errorMsg}`);
      return [];
    }
  }
  function queueRemainingEpisodes(episodes, seriesName, defaultSeasonNumber) {
    if (episodes.length === 0) return;
    if (isClosing?.()) {
      log("Window is closing, skipping queueRemainingEpisodes");
      return;
    }
    try {
      const playlistCount = Number(mpv2.getNumber("playlist-count") || 0);
      const currentPos = Number(mpv2.getNumber("playlist-pos"));
      if (Number.isFinite(currentPos) && currentPos >= 0 && playlistCount > currentPos + 1) {
        for (let i = playlistCount - 1; i > currentPos; i--) {
          try {
            if (isClosing?.()) return;
            mpv2.command("playlist-remove", [String(i)]);
          } catch {
          }
        }
        log(`Cleaned ${playlistCount - currentPos - 1} stale playlist entries`);
      }
      if (file2 && utils2 && typeof file2.write === "function") {
        let m3uContent = "#EXTM3U\n";
        for (const episode of episodes) {
          if (isClosing?.()) return;
          const seasonNum = episode.seasonNumber ?? defaultSeasonNumber;
          const episodeTitle = formatFullEpisodeTitle(seriesName, seasonNum, episode.indexNumber, episode.name);
          const cleanTitle = episodeTitle.replace(/[\r\n]+/g, " ");
          m3uContent += `#EXTINF:-1,${cleanTitle}
${episode.playUrl}
`;
        }
        const m3uPath = utils2.resolvePath("@data/autoplay_queue.m3u8");
        file2.write(m3uPath, m3uContent);
        log(`Queueing ${episodes.length} upcoming episode(s) via loadlist: ${m3uPath}`);
        mpv2.command("loadlist", [m3uPath, "append"]);
      } else {
        for (const episode of episodes) {
          if (isClosing?.()) return;
          const seasonNum = episode.seasonNumber ?? defaultSeasonNumber;
          const episodeTitle = formatFullEpisodeTitle(seriesName, seasonNum, episode.indexNumber, episode.name);
          mpv2.command("loadfile", [episode.playUrl, "append"]);
          log(`Appended to playlist: ${episodeTitle}`);
        }
      }
      autoplayQueued = true;
      log(`Queued ${episodes.length} upcoming episode(s) to playlist`);
      if (iinaGlobal2 && typeof iinaGlobal2.postMessage === "function") {
        iinaGlobal2.postMessage("player-next-queued", {
          count: episodes.length,
          firstTitle: episodes[0]?.name
        });
      }
      if (preferences2.get("show_notifications") && episodes.length > 0) {
        const nextTitle = formatFullEpisodeTitle(
          seriesName,
          episodes[0].seasonNumber ?? defaultSeasonNumber,
          episodes[0].indexNumber,
          episodes[0].name
        );
        core2.osd(`Queued ${episodes.length} episodes (Next: ${nextTitle})`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error queuing remaining episodes: ${errorMsg}`);
      console.error(`[iina-emby] Failed to queue remaining episodes: ${errorMsg}`);
    }
  }
  function setupAutoplayForEpisode2(serverBase, episodeId, apiKey, userId) {
    if (isClosing?.()) {
      log("Window is closing, skipping setupAutoplayForEpisode");
      return;
    }
    if (lastProcessedEpisodeId === episodeId) {
      log(`Episode ${episodeId} already being processed, skipping duplicate setup`);
      return;
    }
    lastProcessedEpisodeId = episodeId;
    try {
      const playlistCount = Number(mpv2.getNumber("playlist-count") || 0);
      const currentPos = Number(mpv2.getNumber("playlist-pos"));
      if (Number.isFinite(currentPos) && currentPos >= 0 && playlistCount > currentPos + 1) {
        log(`Playlist already has ${playlistCount - currentPos - 1} upcoming episode(s), skipping fetch`);
        autoplayQueued = true;
        return;
      }
    } catch {
    }
    autoplayQueued = false;
    autoplayRequestCounter++;
    const thisRequestId = autoplayRequestCounter;
    (async () => {
      try {
        log(`Setting up autoplay for episode: ${episodeId} (request #${thisRequestId}), userId: ${userId || "none"}`);
        const seriesInfo = await getSeriesInfoFromEpisode(serverBase, episodeId, apiKey, userId);
        if (thisRequestId !== autoplayRequestCounter) {
          log(`Autoplay request #${thisRequestId} is stale (current: #${autoplayRequestCounter}), aborting`);
          return;
        }
        if (!seriesInfo) {
          log("Could not get series info, autoplay not available");
          return;
        }
        log(
          `Got series info: series=${seriesInfo.seriesId}, season=${seriesInfo.seasonId}, seasonNum=${seriesInfo.seasonNumber}, currentEp=${seriesInfo.currentEpisodeNumber}`
        );
        if (lastProcessedSeriesId !== seriesInfo.seriesId) {
          log(`Series changed from ${lastProcessedSeriesId} to ${seriesInfo.seriesId}`);
          lastProcessedSeriesId = seriesInfo.seriesId;
        }
        const remainingEpisodes = await resolveRemainingEpisodes(
          serverBase,
          seriesInfo.seriesId,
          seriesInfo.seasonId,
          seriesInfo.currentEpisodeNumber,
          apiKey,
          userId
        );
        if (thisRequestId !== autoplayRequestCounter) {
          log(`Autoplay request #${thisRequestId} is stale after resolve, aborting`);
          return;
        }
        if (remainingEpisodes.length === 0) {
          log("No remaining episodes found \u2014 end of series");
          return;
        }
        queueRemainingEpisodes(remainingEpisodes, seriesInfo.seriesName, seriesInfo.seasonNumber);
        log(`Autoplay setup complete \u2014 queued ${remainingEpisodes.length} upcoming episode(s)`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Error setting up autoplay: ${errorMsg}`);
      }
    })();
  }
  function resetForNewFile2(_episodeId) {
    lastProcessedEpisodeId = null;
    autoplayQueued = false;
  }
  function clearQueuedFlag2() {
    autoplayQueued = false;
  }
  function isQueued2() {
    return autoplayQueued;
  }
  return {
    setupAutoplayForEpisode: setupAutoplayForEpisode2,
    resetForNewFile: resetForNewFile2,
    clearQueuedFlag: clearQueuedFlag2,
    isQueued: isQueued2
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
      if (h) {
        h.seekToEnd();
        h.write(line);
        if (typeof h.close === "function") {
          h.close();
        }
      }
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
  function getClientIdentity() {
    return {
      clientName: CLIENT_NAME,
      deviceName: DEVICE_NAME,
      deviceId: getDeviceId(),
      version: CLIENT_VERSION
    };
  }
  function buildAuthorizationHeader2(apiKey) {
    return buildAuthorizationHeader(getClientIdentity(), apiKey);
  }
  function buildEmbyHeaders3(apiKey, extraHeaders) {
    return buildEmbyHeaders(getClientIdentity(), apiKey, extraHeaders);
  }
  function parseEmbyUrl2(url) {
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
  function isEmbyUrl2(url) {
    if (!url || !/^https?:\/\//i.test(url)) {
      return false;
    }
    return url.includes("/Items/") && /[?&](?:api_key|apikey|api-key|x-emby-token)=/i.test(url) || url.toLowerCase().includes("emby") || /[?&](?:x-emby-token)=/i.test(url) || url.includes("/Audio/") || url.includes("/Videos/");
  }
  async function fetchPlaybackInfo2(serverBase, itemId, apiKey) {
    try {
      const playbackUrl = `${serverBase}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}`;
      log(`Fetching playback info from: ${playbackUrl}`);
      const response = await http2.get(playbackUrl, {
        headers: buildEmbyHeaders3(apiKey, {
          Accept: "application/json"
        })
      });
      log("Response received");
      if (!response.data) {
        throw new Error("No data received from Emby API");
      }
      if (typeof response.data === "object" && response.data !== null) {
        const info = response.data;
        log("Response data is already parsed object");
        log(`MediaSources found: ${info.MediaSources ? info.MediaSources.length : "none"}`);
        return info;
      }
      log("Response data is string, parsing manually");
      const text = typeof response.data === "string" ? response.data : response.text;
      log(`Response.data preview: ${text.substring(0, 200)}`);
      return JSON.parse(text);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching playback info: ${errorMsg}`);
      throw error;
    }
  }
  async function fetchItemMetadata2(serverBase, itemId, apiKey, userId) {
    try {
      const metadataUrl = userId ? `${serverBase}/Users/${encodeURIComponent(userId)}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}` : `${serverBase}/Items/${encodeURIComponent(itemId)}?api_key=${apiKey}`;
      log(`Fetching item metadata from: ${metadataUrl}`);
      const response = await http2.get(metadataUrl, {
        headers: buildEmbyHeaders3(apiKey, {
          Accept: "application/json"
        })
      });
      log("Metadata response received");
      if (!response.data) {
        throw new Error("No metadata received from Emby API");
      }
      if (typeof response.data === "object" && response.data !== null) {
        const meta = response.data;
        log("Metadata is already parsed object");
        log(`Item name: ${meta.Name}`);
        log(`Item type: ${meta.Type}`);
        return meta;
      }
      log("Metadata is string, parsing manually");
      const text = typeof response.data === "string" ? response.data : response.text;
      log(`Metadata preview: ${text.substring(0, 200)}`);
      return JSON.parse(text);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching item metadata: ${errorMsg}`);
      throw error;
    }
  }
  return {
    getClientIdentity,
    buildAuthorizationHeader: buildAuthorizationHeader2,
    buildEmbyHeaders: buildEmbyHeaders3,
    parseEmbyUrl: parseEmbyUrl2,
    isEmbyUrl: isEmbyUrl2,
    fetchPlaybackInfo: fetchPlaybackInfo2,
    fetchItemMetadata: fetchItemMetadata2,
    secondsToTicks,
    ticksToSeconds
  };
}

// plugin/src/lib/media-actions.ts
function subtitleExtensionForCodec(codec) {
  if (codec === "subrip") return "srt";
  if (codec === "webvtt" || codec === "vtt") return "vtt";
  if (codec === "ass") return "ass";
  if (codec === "ssa") return "ssa";
  if (codec?.toLowerCase().includes("srt")) return "srt";
  if (codec?.toLowerCase().includes("vtt")) return "vtt";
  return "srt";
}
function formatExternalSubtitleFileName(subtitleTitle, language, extension = "srt") {
  let trackLabel = (subtitleTitle || "").trim();
  if (!trackLabel) {
    if (language && language !== "und" && language !== "unknown") {
      trackLabel = language.toUpperCase();
    } else {
      trackLabel = "\u5B57\u5E55";
    }
  }
  const lower = trackLabel.toLowerCase();
  if (lower === "chi" || lower === "zho" || lower === "zh" || lower === "zh-cn") {
    trackLabel = "\u7B80\u4F53\u4E2D\u6587";
  } else if (lower === "zh-tw" || lower === "zh-hk") {
    trackLabel = "\u7E41\u4F53\u4E2D\u6587";
  } else if (lower === "eng" || lower === "en") {
    trackLabel = "\u82F1\u8BED";
  } else if (lower === "jpn" || lower === "ja") {
    trackLabel = "\u65E5\u8BED";
  } else if (lower === "kor" || lower === "ko") {
    trackLabel = "\u97E9\u8BED";
  }
  trackLabel = trackLabel.replace(new RegExp(`\\.${extension}$`, "i"), "").trim();
  if (!trackLabel.startsWith("[\u5916\u6302]")) {
    trackLabel = `[\u5916\u6302] ${trackLabel}`;
  }
  const safeTitle = trackLabel.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").trim() || "[\u5916\u6302] \u5B57\u5E55";
  return `${safeTitle}.${extension}`;
}
function createMediaActionsManager({
  core: core2,
  http: http2,
  utils: utils2,
  preferences: preferences2,
  mpv: mpv2,
  parseEmbyUrl: parseEmbyUrl2,
  isEmbyUrl: isEmbyUrl2,
  fetchPlaybackInfo: fetchPlaybackInfo2,
  fetchItemMetadata: fetchItemMetadata2,
  getActiveSession,
  log
}) {
  let lastEmbyUrl = null;
  let lastItemId = null;
  async function setVideoTitleFromMetadata2(serverBase, itemId, apiKey, userId) {
    try {
      if (!preferences2.get("set_video_title")) {
        log("Video title setting is disabled in preferences");
        return;
      }
      if (!userId && getActiveSession) {
        const session = getActiveSession();
        if (session?.userId && isSameEmbyHost(session.serverUrl, serverBase)) {
          userId = session.userId;
          if (preferences2.get("use_connected_account") && session.accessToken) {
            apiKey = session.accessToken;
            serverBase = session.serverUrl;
          }
        }
      }
      const metadata = await fetchItemMetadata2(serverBase, itemId, apiKey, userId);
      if (!metadata?.Name) {
        log("No title found in metadata");
        return;
      }
      let seriesName = metadata.SeriesName;
      if (metadata.Type === "Episode" && !seriesName && metadata.SeriesId) {
        try {
          const seriesMetadata = await fetchItemMetadata2(serverBase, metadata.SeriesId, apiKey, userId);
          if (seriesMetadata?.Name) {
            seriesName = seriesMetadata.Name;
          }
        } catch {
        }
      }
      let title = metadata.Name;
      if (metadata.Type === "Episode") {
        title = formatFullEpisodeTitle(seriesName, metadata.ParentIndexNumber, metadata.IndexNumber, metadata.Name);
      } else if (metadata.Type === "Movie" && metadata.ProductionYear) {
        title = `${metadata.Name} (${metadata.ProductionYear})`;
      }
      log(`Setting video title to: "${title}"`);
      let titleSet = false;
      if (typeof mpv2 !== "undefined" && typeof mpv2.set === "function") {
        try {
          mpv2.set("force-media-title", title);
          titleSet = true;
          log(`Video title set via mpv force-media-title: ${title}`);
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log(`mpv.set('force-media-title') failed: ${errorMsg}`);
        }
        try {
          mpv2.set("title", title);
          log(`Video title set via mpv title: ${title}`);
        } catch {
        }
      }
      if (!titleSet) {
        log(`Could not set title via IINA API, title would be: ${title}`);
      }
      if (preferences2.get("show_notifications")) {
        core2.osd(`Title: ${title}`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error setting video title: ${errorMsg}`);
    }
  }
  async function downloadExternalSubtitle2(serverBase, itemId, mediaSourceId, streamIndex, subtitlePath, apiKey, language, codec, deliveryUrl, subtitleTitle) {
    try {
      const extension = subtitleExtensionForCodec(codec);
      let subtitleUrl;
      if (deliveryUrl && typeof deliveryUrl === "string") {
        if (deliveryUrl.startsWith("http://") || deliveryUrl.startsWith("https://")) {
          subtitleUrl = deliveryUrl;
        } else {
          const cleanBase = serverBase.replace(/\/+$/, "");
          const cleanPath = deliveryUrl.startsWith("/") ? deliveryUrl : `/${deliveryUrl}`;
          subtitleUrl = `${cleanBase}${cleanPath}`;
        }
        if (apiKey && !subtitleUrl.includes("api_key=") && !subtitleUrl.includes("X-Emby-Token=")) {
          subtitleUrl += (subtitleUrl.includes("?") ? "&" : "?") + `api_key=${encodeURIComponent(apiKey)}`;
        }
      } else {
        let effectiveMediaSourceId = mediaSourceId;
        if (!effectiveMediaSourceId) {
          try {
            const pb = await fetchPlaybackInfo2(serverBase, itemId, apiKey);
            effectiveMediaSourceId = pb.MediaSources?.[0]?.Id;
          } catch {
          }
        }
        const cleanBase = serverBase.replace(/\/+$/, "");
        subtitleUrl = `${cleanBase}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(effectiveMediaSourceId || itemId)}/Subtitles/${streamIndex}/Stream.${extension}?api_key=${encodeURIComponent(apiKey)}`;
      }
      const fileName = formatExternalSubtitleFileName(subtitleTitle, language, extension);
      const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeStreamIndex = typeof streamIndex === "number" ? streamIndex : 0;
      const localPath = `@tmp/emby_${sanitizedItemId}_${safeStreamIndex}/${fileName}`;
      log(`Using filename: ${fileName}, localPath: ${localPath}`);
      log(`Downloading external subtitle: ${subtitleUrl} to ${localPath}`);
      log(`External subtitle path: ${subtitlePath}`);
      log(`Stream index: ${streamIndex}`);
      log(`Language: ${language}`);
      log(`Codec: ${codec} -> Extension: ${extension}`);
      await http2.download(subtitleUrl, localPath);
      const resolvedPath = typeof utils2.resolvePath === "function" ? utils2.resolvePath(localPath) : localPath;
      log(`External subtitle downloaded to: ${resolvedPath}`);
      try {
        const statRes = await utils2.exec("/usr/bin/test", ["-s", resolvedPath]);
        if (statRes.status !== 0) {
          log.error(`Downloaded subtitle file is empty or does not exist: ${resolvedPath}`);
          return false;
        }
      } catch {
      }
      let loaded = false;
      try {
        core2.subtitle.loadTrack(resolvedPath);
        loaded = true;
        log(`External subtitle loaded successfully via core.subtitle.loadTrack: ${resolvedPath}`);
      } catch (coreErr) {
        log(`core.subtitle.loadTrack error, trying mpv sub-add:`, coreErr);
        try {
          mpv2.command("sub-add", [resolvedPath, "select"]);
          loaded = true;
          log(`External subtitle loaded successfully via mpv sub-add: ${resolvedPath}`);
        } catch (mpvErr) {
          log.error(`mpv sub-add also failed:`, mpvErr);
          return false;
        }
      }
      try {
        const currentSid = mpv2.getString("sid");
        if (currentSid === "no" || currentSid === "0") {
          const trackList = mpv2.getNative("track-list");
          if (Array.isArray(trackList)) {
            const subTracks = trackList.filter((t) => t.type === "sub");
            if (subTracks.length > 0) {
              const lastTrack = subTracks[subTracks.length - 1];
              log(`Activating newly loaded subtitle track: id=${lastTrack.id}`);
              mpv2.set("sid", lastTrack.id);
              if (core2.subtitle) {
                core2.subtitle.id = lastTrack.id;
              }
            }
          }
        }
      } catch {
      }
      if (preferences2.get("show_notifications")) {
        core2.osd(`Loaded external ${language} subtitle`);
      }
      return loaded;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error downloading external subtitle: ${errorMsg}`);
      return false;
    }
  }
  async function downloadAllSubtitles2(serverBase, itemId, apiKey) {
    try {
      const playbackInfo = await fetchPlaybackInfo2(serverBase, itemId, apiKey);
      if (!playbackInfo.MediaSources || playbackInfo.MediaSources.length === 0) {
        log("No media sources found");
        return;
      }
      const mediaSource = playbackInfo.MediaSources[0];
      const mediaStreams = mediaSource.MediaStreams || [];
      const subtitleStreams = mediaStreams.filter(
        (stream) => stream.Type === "Subtitle" && stream.IsTextSubtitleStream && stream.IsExternal
      );
      log(`Found ${subtitleStreams.length} external subtitle stream(s)`);
      const preferredLanguages = (preferences2.get("preferred_languages") || "en,eng").split(",").map((lang) => lang.trim().toLowerCase()).filter((lang) => lang.length > 0);
      const shouldDownloadAll = preferences2.get("download_all_subtitles");
      let downloadedCount = 0;
      for (const stream of subtitleStreams) {
        const language = stream.Language || "unknown";
        const codec = stream.Codec || "srt";
        const shouldDownload = shouldDownloadAll || preferredLanguages.some((prefLang) => language.toLowerCase().includes(prefLang) || prefLang.includes(language.toLowerCase()));
        if (!shouldDownload) {
          log(`Skipping subtitle: ${language} (not in preferred languages)`);
          continue;
        }
        log(`Processing external subtitle: ${language} (${codec}) - Index: ${stream.Index}`);
        try {
          const streamTitle = stream.DisplayTitle || stream.Title || stream.DisplayLanguage || stream.Language;
          const downloaded = await downloadExternalSubtitle2(
            serverBase,
            itemId,
            mediaSource.Id,
            stream.Index,
            stream.Path,
            apiKey,
            language,
            codec,
            stream.DeliveryUrl,
            streamTitle || null
          );
          if (downloaded) {
            downloadedCount++;
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log(`Failed to download subtitle ${language}: ${errorMsg}`);
        }
      }
      if (downloadedCount > 0 && preferences2.get("show_notifications")) {
        core2.osd(`Downloaded ${downloadedCount} subtitle(s)`);
      } else if (downloadedCount === 0) {
        log("No external subtitles downloaded");
        if (preferences2.get("show_notifications")) {
          core2.osd("No matching external subtitles found");
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error downloading subtitles: ${errorMsg}`);
      if (preferences2.get("show_notifications")) {
        core2.osd("Failed to download subtitles");
      }
    }
  }
  function updateLastFromCurrentUrl(currentUrl) {
    const embyInfo = parseEmbyUrl2(currentUrl);
    if (!embyInfo) {
      log(`Failed to parse Emby URL: ${currentUrl}`);
      return null;
    }
    lastEmbyUrl = currentUrl;
    lastItemId = embyInfo.itemId;
    return embyInfo;
  }
  function resolveCurrentEmbyUrl() {
    let currentUrl = lastEmbyUrl;
    if (!currentUrl) {
      try {
        const currentFile = core2.status.url;
        log(`No stored URL, core.status.url = "${currentFile}"`);
        if (currentFile && isEmbyUrl2(currentFile)) {
          currentUrl = currentFile;
          log(`Using current file URL: ${currentUrl}`);
        } else {
          log("Current file is not an Emby URL or is empty");
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Error getting current file URL: ${errorMsg}`);
      }
    }
    return currentUrl;
  }
  function manualDownloadSubtitles2() {
    log("Manual download requested");
    log(`lastEmbyUrl = "${lastEmbyUrl}"`);
    const currentUrl = resolveCurrentEmbyUrl();
    if (!currentUrl) {
      log("No Emby URL found - checking for Emby URL in current file");
      core2.osd("No Emby media detected. Please open an Emby URL first.");
      return;
    }
    log(`Attempting to download subtitles for: ${currentUrl}`);
    if (!isEmbyUrl2(currentUrl)) {
      log(`URL is not an Emby URL: ${currentUrl}`);
      core2.osd("Current media is not from Emby");
      return;
    }
    const embyInfo = updateLastFromCurrentUrl(currentUrl);
    if (!embyInfo) {
      core2.osd("Failed to parse Emby URL - check console for details");
      return;
    }
    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;
    if (getActiveSession) {
      const session = getActiveSession();
      if (session?.userId && isSameEmbyHost(session.serverUrl, reportServerBase)) {
        if (preferences2.get("use_connected_account") && session.accessToken) {
          reportApiKey = session.accessToken;
          reportServerBase = session.serverUrl;
        }
      }
    }
    log(`Downloading subtitles for item: ${embyInfo.itemId}`);
    core2.osd("Downloading subtitles...");
    downloadAllSubtitles2(reportServerBase, embyInfo.itemId, reportApiKey);
  }
  function manualSetTitle2() {
    log("Manual title setting requested");
    log(`lastEmbyUrl = "${lastEmbyUrl}"`);
    const currentUrl = resolveCurrentEmbyUrl();
    if (!currentUrl) {
      log("No Emby URL found - checking for Emby URL in current file");
      core2.osd("No Emby media detected. Please open an Emby URL first.");
      return;
    }
    log(`Attempting to set title for: ${currentUrl}`);
    if (!isEmbyUrl2(currentUrl)) {
      log(`URL is not an Emby URL: ${currentUrl}`);
      core2.osd("Current media is not from Emby");
      return;
    }
    const embyInfo = updateLastFromCurrentUrl(currentUrl);
    if (!embyInfo) {
      core2.osd("Failed to parse Emby URL - check console for details");
      return;
    }
    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;
    let reportUserId;
    if (getActiveSession) {
      const session = getActiveSession();
      if (session?.userId && isSameEmbyHost(session.serverUrl, reportServerBase)) {
        reportUserId = session.userId;
        if (preferences2.get("use_connected_account") && session.accessToken) {
          reportApiKey = session.accessToken;
          reportServerBase = session.serverUrl;
        }
      }
    }
    log(`Setting title for item: ${embyInfo.itemId}`);
    core2.osd("Fetching title...");
    setVideoTitleFromMetadata2(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
  }
  function updateFromFileUrl2(fileUrl) {
    if (isEmbyUrl2(fileUrl)) {
      const embyInfo = parseEmbyUrl2(fileUrl);
      if (embyInfo) {
        lastEmbyUrl = fileUrl || null;
        lastItemId = embyInfo.itemId;
        log(`Stored Emby media for manual download: ${embyInfo.itemId}`);
        return embyInfo;
      }
      log("Failed to parse Emby URL");
      return null;
    }
    log("Non-Emby URL loaded, clearing stored Emby data");
    lastEmbyUrl = null;
    lastItemId = null;
    log("Not an Emby URL, skipping subtitle download");
    return null;
  }
  function getLastItemId() {
    return lastItemId;
  }
  return {
    setVideoTitleFromMetadata: setVideoTitleFromMetadata2,
    downloadAllSubtitles: downloadAllSubtitles2,
    downloadExternalSubtitle: downloadExternalSubtitle2,
    manualDownloadSubtitles: manualDownloadSubtitles2,
    manualSetTitle: manualSetTitle2,
    updateFromFileUrl: updateFromFileUrl2,
    getLastItemId
  };
}

// plugin/src/lib/playback-coordinator.ts
var REPLACEMENT_GUARD_MS = 1e4;
var PENDING_QUEUE_TTL_MS = 6e4;
function createPlaybackCoordinator({
  core: core2,
  mpv: mpv2,
  preferences: preferences2,
  file: file2,
  utils: utils2,
  global: iinaGlobal2,
  getCurrentPlaybackSession: getCurrentPlaybackSession2,
  clearQueuedFlag: clearQueuedFlag2,
  log
}) {
  let replacingPlaybackAt = 0;
  let currentPlaybackTitle = null;
  let currentPlaybackItemId = null;
  let currentPlaybackStartPositionSeconds = null;
  let currentPlaybackAudioIndex = null;
  let currentPlaybackSubtitleIndex = null;
  let currentPlaybackAudioTrackNumber = null;
  let currentPlaybackSubtitleTrackNumber = null;
  let currentPlaybackAudioLanguage = null;
  let currentPlaybackSubtitleLanguage = null;
  let currentPlaybackIsExternalSubtitle = null;
  let currentPlaybackSubtitlePath = null;
  let currentPlaybackSubtitleCodec = null;
  let currentPlaybackMediaSourceId = null;
  let currentPlaybackSubtitleDeliveryUrl = null;
  let currentPlaybackSubtitleTitle = null;
  function setPendingPlaybackData2(message) {
    if (!message) return;
    if (message.title) {
      currentPlaybackTitle = message.title;
    }
    const streamUrl = message.streamUrl;
    if (streamUrl) {
      const match = (String(streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1];
      if (match && currentPlaybackItemId && match !== currentPlaybackItemId) {
        clearPendingTracks2();
      }
      if (match) {
        currentPlaybackItemId = match;
      }
    }
    const startPositionTicks = message.startPositionTicks;
    const startPositionSeconds = typeof startPositionTicks === "number" && startPositionTicks > 0 ? ticksToSeconds(startPositionTicks) : message.startPositionSeconds;
    if (typeof startPositionSeconds === "number") {
      currentPlaybackStartPositionSeconds = startPositionSeconds;
    }
    if (typeof message.selectedAudioIndex === "number") {
      currentPlaybackAudioIndex = message.selectedAudioIndex;
    }
    if (typeof message.selectedSubtitleIndex === "number") {
      currentPlaybackSubtitleIndex = message.selectedSubtitleIndex;
    }
    if (typeof message.audioTrackNumber === "number") {
      currentPlaybackAudioTrackNumber = message.audioTrackNumber;
    }
    if (typeof message.subtitleTrackNumber === "number") {
      currentPlaybackSubtitleTrackNumber = message.subtitleTrackNumber;
    }
    if (typeof message.audioLanguage === "string") {
      currentPlaybackAudioLanguage = message.audioLanguage;
    }
    if (typeof message.subtitleLanguage === "string") {
      currentPlaybackSubtitleLanguage = message.subtitleLanguage;
    }
    if (typeof message.isExternalSubtitle === "boolean") {
      currentPlaybackIsExternalSubtitle = message.isExternalSubtitle;
    }
    if (typeof message.subtitlePath === "string") {
      currentPlaybackSubtitlePath = message.subtitlePath;
    }
    if (typeof message.subtitleCodec === "string") {
      currentPlaybackSubtitleCodec = message.subtitleCodec;
    }
    if (typeof message.mediaSourceId === "string") {
      currentPlaybackMediaSourceId = message.mediaSourceId;
    }
    if (typeof message.subtitleDeliveryUrl === "string") {
      currentPlaybackSubtitleDeliveryUrl = message.subtitleDeliveryUrl;
    }
    if (typeof message.subtitleTitle === "string") {
      currentPlaybackSubtitleTitle = message.subtitleTitle;
    }
  }
  function isItemMatching(targetItemId) {
    if (!targetItemId || !currentPlaybackItemId) return true;
    const a = String(currentPlaybackItemId).trim().toLowerCase();
    const b = String(targetItemId).trim().toLowerCase();
    return a === b || a.includes(b) || b.includes(a);
  }
  function getPendingMediaTitle2(itemId) {
    if (!currentPlaybackTitle) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackTitle;
  }
  function getPendingStartPosition2(itemId) {
    if (typeof currentPlaybackStartPositionSeconds !== "number") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackStartPositionSeconds;
  }
  function getPendingAudioIndex2(itemId) {
    if (typeof currentPlaybackAudioIndex !== "number") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackAudioIndex;
  }
  function getPendingSubtitleIndex2(itemId) {
    if (typeof currentPlaybackSubtitleIndex !== "number") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleIndex;
  }
  function getPendingAudioTrackNumber2(itemId) {
    if (typeof currentPlaybackAudioTrackNumber !== "number") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackAudioTrackNumber;
  }
  function getPendingSubtitleTrackNumber2(itemId) {
    if (typeof currentPlaybackSubtitleTrackNumber !== "number") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleTrackNumber;
  }
  function getPendingAudioLanguage2(itemId) {
    if (!currentPlaybackAudioLanguage) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackAudioLanguage;
  }
  function getPendingSubtitleLanguage2(itemId) {
    if (!currentPlaybackSubtitleLanguage) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleLanguage;
  }
  function getPendingIsExternalSubtitle2(itemId) {
    if (typeof currentPlaybackIsExternalSubtitle !== "boolean") return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackIsExternalSubtitle;
  }
  function getPendingSubtitlePath2(itemId) {
    if (!currentPlaybackSubtitlePath) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitlePath;
  }
  function getPendingSubtitleCodec2(itemId) {
    if (!currentPlaybackSubtitleCodec) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleCodec;
  }
  function getPendingMediaSourceId2(itemId) {
    if (!currentPlaybackMediaSourceId) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackMediaSourceId;
  }
  function getPendingSubtitleDeliveryUrl2(itemId) {
    if (!currentPlaybackSubtitleDeliveryUrl) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleDeliveryUrl;
  }
  function getPendingSubtitleTitle2(itemId) {
    if (!currentPlaybackSubtitleTitle) return null;
    if (!isItemMatching(itemId)) return null;
    return currentPlaybackSubtitleTitle;
  }
  function clearPendingSubtitle2(itemId) {
    if (!isItemMatching(itemId)) return;
    currentPlaybackSubtitleIndex = null;
    currentPlaybackSubtitleTrackNumber = null;
    currentPlaybackSubtitleLanguage = null;
    currentPlaybackIsExternalSubtitle = null;
    currentPlaybackSubtitlePath = null;
    currentPlaybackSubtitleCodec = null;
    currentPlaybackMediaSourceId = null;
    currentPlaybackSubtitleDeliveryUrl = null;
    currentPlaybackSubtitleTitle = null;
  }
  function clearPendingAudio2(itemId) {
    if (!isItemMatching(itemId)) return;
    currentPlaybackAudioIndex = null;
    currentPlaybackAudioTrackNumber = null;
    currentPlaybackAudioLanguage = null;
  }
  function clearPendingTracks2(itemId) {
    clearPendingSubtitle2(itemId);
    clearPendingAudio2(itemId);
  }
  function markReplacingPlayback() {
    replacingPlaybackAt = Date.now();
  }
  function consumeReplacementGuard2() {
    if (!replacingPlaybackAt) {
      return false;
    }
    const age = Date.now() - replacingPlaybackAt;
    replacingPlaybackAt = 0;
    if (age > REPLACEMENT_GUARD_MS) {
      log(`Ignoring replacement guard set ${age}ms ago (expired)`);
      return false;
    }
    return true;
  }
  let launchedFromBrowser = false;
  function markLaunchedFromBrowser2() {
    launchedFromBrowser = true;
  }
  function clearLaunchedFromBrowser2() {
    launchedFromBrowser = false;
  }
  function isLaunchedFromBrowser2() {
    return launchedFromBrowser;
  }
  function consumeLaunchedFromBrowser2() {
    const wasLaunched = launchedFromBrowser;
    launchedFromBrowser = false;
    return wasLaunched;
  }
  function openInNewInstance(playData) {
    if (iinaGlobal2 && typeof iinaGlobal2.postMessage === "function") {
      log("Requesting new player instance from global entry");
      iinaGlobal2.postMessage("create-player", playData);
    } else {
      log("Global entry not available, opening in current window");
      openInCurrentWindow(playData.streamUrl, playData.title, playData.startPositionSeconds);
    }
  }
  function openInCurrentWindow(streamUrl, title, startPositionSeconds) {
    log("Opening media in current window: " + streamUrl);
    markLaunchedFromBrowser2();
    currentPlaybackTitle = title || null;
    currentPlaybackItemId = (String(streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1] || null;
    currentPlaybackStartPositionSeconds = typeof startPositionSeconds === "number" ? startPositionSeconds : null;
    if (getCurrentPlaybackSession2()) {
      markReplacingPlayback();
    }
    try {
      const playlistCount = Number(mpv2.getNumber("playlist-count") || 0);
      if (playlistCount > 1) {
        mpv2.command("playlist-clear", []);
      }
      clearQueuedFlag2();
    } catch (clearError) {
      const errorMsg = clearError instanceof Error ? clearError.message : String(clearError);
      log(`Could not clear playlist before opening: ${errorMsg}`);
    }
    if (title) {
      try {
        mpv2.set("force-media-title", title);
      } catch {
      }
      try {
        mpv2.set("title", title);
      } catch {
      }
    }
    if (typeof startPositionSeconds === "number" && startPositionSeconds > 0) {
      log(`Setting initial start position to ${startPositionSeconds}s`);
      try {
        mpv2.set("start", `${startPositionSeconds}`);
      } catch (err) {
        log(`Could not set mpv start position: ${String(err)}`);
      }
    }
    core2.open(streamUrl);
  }
  let pendingPlaylistQueue = null;
  function flushPendingPlaylistQueue2(fileUrl) {
    if (!pendingPlaylistQueue) {
      return;
    }
    const { items, at, itemId } = pendingPlaylistQueue;
    pendingPlaylistQueue = null;
    if (Date.now() - at > PENDING_QUEUE_TTL_MS) {
      log("Queued playlist items are stale, not appending them");
      return;
    }
    if (itemId && fileUrl && !String(fileUrl).includes(itemId)) {
      log(`Loaded file is not the queued list's first item (${itemId}), dropping the queue`);
      return;
    }
    try {
      if (file2 && utils2 && typeof file2.write === "function") {
        let m3uContent = "#EXTM3U\n";
        for (const item of items) {
          const title = (item.title || "Episode").replace(/[\r\n]+/g, " ");
          m3uContent += `#EXTINF:-1,${title}
${item.streamUrl}
`;
        }
        const m3uPath = utils2.resolvePath("@data/playlist_queue.m3u8");
        file2.write(m3uPath, m3uContent);
        log(`Appending ${items.length} queued item(s) via loadlist: ${m3uPath}`);
        mpv2.command("loadlist", [m3uPath, "append"]);
      } else {
        for (const item of items) {
          const args = [item.streamUrl, "append"];
          if (item.title) {
            args.push("-1", `force-media-title=${item.title}`);
          }
          mpv2.command("loadfile", args);
        }
      }
      log(`Appended ${items.length} queued item(s) to the playlist`);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log("Could not append queued items: " + errorMsg);
    }
  }
  function handlePlayMediaList2(message) {
    const rawItems = message?.items || [];
    const items = rawItems.filter((item) => Boolean(item?.streamUrl)).map((item) => ({
      ...item,
      streamUrl: sanitizeStreamUrl(item.streamUrl) || item.streamUrl
    }));
    log(`handlePlayMediaList called with ${items.length} playable item(s)`);
    if (items.length === 0) {
      log("No playable items in list");
      core2.osd("Nothing to play");
      return;
    }
    const [firstItem, ...queuedItems] = items;
    try {
      if (queuedItems.length > 0) {
        core2.osd(`Playing ${items.length} tracks, starting with: ${firstItem.title || ""}`);
      } else {
        core2.osd(`Opening: ${firstItem.title || ""}`);
      }
      const firstItemId = (String(firstItem.streamUrl).match(/\/(?:Items|Videos|Audio)\/([^/?]+)/) || [])[1] || null;
      pendingPlaylistQueue = queuedItems.length > 0 ? { items: queuedItems, at: Date.now(), itemId: firstItemId } : null;
      markLaunchedFromBrowser2();
      openInCurrentWindow(firstItem.streamUrl, firstItem.title);
      log(`Holding ${queuedItems.length} item(s) until the first one loads`);
    } catch (error) {
      clearLaunchedFromBrowser2();
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Error playing media list: " + errorMsg);
      core2.osd("Failed to play tracks");
    }
  }
  function handlePlayMedia2(message) {
    log("HANDLE PLAY MEDIA CALLED");
    log("handlePlayMedia called with message", {
      title: message?.title,
      streamUrl: message?.streamUrl,
      selectedAudioIndex: message?.selectedAudioIndex,
      selectedSubtitleIndex: message?.selectedSubtitleIndex,
      audioTrackNumber: message?.audioTrackNumber,
      subtitleTrackNumber: message?.subtitleTrackNumber
    });
    const streamUrl = sanitizeStreamUrl(message?.streamUrl);
    const title = message?.title;
    if (!streamUrl) {
      log("handlePlayMedia called without streamUrl");
      return;
    }
    log(`Opening media: ${title} - ${streamUrl}`);
    setPendingPlaybackData2({ ...message, streamUrl });
    const startPositionTicks = message?.startPositionTicks;
    const startPositionSeconds = typeof startPositionTicks === "number" && startPositionTicks > 0 ? ticksToSeconds(startPositionTicks) : message?.startPositionSeconds;
    try {
      markLaunchedFromBrowser2();
      const openInNewWindow = preferences2.get("open_in_new_window");
      log("open_in_new_window preference: " + openInNewWindow);
      if (openInNewWindow) {
        log("Opening media in new instance: " + streamUrl);
        core2.osd(`Opening in new window: ${title || ""}`);
        openInNewInstance({ ...message, streamUrl, title, startPositionSeconds });
      } else {
        core2.osd(`Opening: ${title || ""}`);
        openInCurrentWindow(streamUrl, title, startPositionSeconds);
      }
      log("Successfully initiated media opening: " + streamUrl);
    } catch (error) {
      clearLaunchedFromBrowser2();
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error("Error opening media: " + errorMsg);
      core2.osd("Failed to open media");
      log.error(`URL that failed to open: ${streamUrl}`);
    }
  }
  if (iinaGlobal2 && typeof iinaGlobal2.onMessage === "function") {
    iinaGlobal2.onMessage("player-created", (data) => {
      log("New player instance created", {
        playerId: data?.playerId,
        title: data?.title,
        url: data?.url
      });
      if (data?.title) {
        core2.osd(`Opened in new window: ${data.title}`);
      }
    });
    iinaGlobal2.onMessage("player-creation-failed", (data) => {
      log.error("Failed to create new player instance: " + (data?.error || ""));
      core2.osd("Failed to open new window - opening in current window");
      if (data?.url) {
        core2.open(data.url);
      }
    });
  }
  return {
    markReplacingPlayback,
    consumeReplacementGuard: consumeReplacementGuard2,
    markLaunchedFromBrowser: markLaunchedFromBrowser2,
    clearLaunchedFromBrowser: clearLaunchedFromBrowser2,
    consumeLaunchedFromBrowser: consumeLaunchedFromBrowser2,
    isLaunchedFromBrowser: isLaunchedFromBrowser2,
    openInNewInstance,
    openInCurrentWindow,
    flushPendingPlaylistQueue: flushPendingPlaylistQueue2,
    handlePlayMediaList: handlePlayMediaList2,
    handlePlayMedia: handlePlayMedia2,
    setPendingPlaybackData: setPendingPlaybackData2,
    getPendingMediaTitle: getPendingMediaTitle2,
    getPendingStartPosition: getPendingStartPosition2,
    getPendingAudioIndex: getPendingAudioIndex2,
    getPendingSubtitleIndex: getPendingSubtitleIndex2,
    getPendingAudioTrackNumber: getPendingAudioTrackNumber2,
    getPendingSubtitleTrackNumber: getPendingSubtitleTrackNumber2,
    getPendingAudioLanguage: getPendingAudioLanguage2,
    getPendingSubtitleLanguage: getPendingSubtitleLanguage2,
    getPendingIsExternalSubtitle: getPendingIsExternalSubtitle2,
    getPendingSubtitlePath: getPendingSubtitlePath2,
    getPendingSubtitleCodec: getPendingSubtitleCodec2,
    getPendingMediaSourceId: getPendingMediaSourceId2,
    getPendingSubtitleDeliveryUrl: getPendingSubtitleDeliveryUrl2,
    getPendingSubtitleTitle: getPendingSubtitleTitle2,
    clearPendingSubtitle: clearPendingSubtitle2,
    clearPendingAudio: clearPendingAudio2,
    clearPendingTracks: clearPendingTracks2
  };
}

// plugin/src/lib/playback-tracking.ts
function createPlaybackTrackingManager({
  core: core2,
  http: http2,
  preferences: preferences2,
  buildEmbyHeaders: buildEmbyHeaders3,
  fetchPlaybackInfo: fetchPlaybackInfo2,
  fetchItemMetadata: fetchItemMetadata2,
  secondsToTicks: secondsToTicks3,
  ticksToSeconds: ticksToSeconds3,
  onProgressUpdated,
  log
}) {
  let currentPlaybackSession = null;
  let sessionRequestCounter = 0;
  let lastReportedPosition = 0;
  let lastKnownPosition = 0;
  let hasStartedPlayback = false;
  let playbackTickCount = 0;
  let playbackTickTimer = null;
  function samplePosition() {
    const position = core2.status.position;
    if (position === null || position === void 0 || position < 0) {
      return null;
    }
    if (position > 0) {
      hasStartedPlayback = true;
      return position;
    }
    return hasStartedPlayback ? 0 : null;
  }
  const PLAYBACK_TICK_INTERVAL = 1e3;
  const PROGRESS_REPORT_TICKS = 10;
  const WATCHED_THRESHOLD = 0.95;
  async function fetchResumePosition(serverBase, itemId, apiKey, userId) {
    try {
      if (!preferences2.get("sync_playback_progress")) {
        log("[resume] Playback progress sync disabled, skipping resume position fetch");
        return null;
      }
      log(`[resume] Requesting metadata for itemId=${itemId}, userId=${userId || "none"}`);
      const metadata = await fetchItemMetadata2(serverBase, itemId, apiKey, userId);
      if (!metadata?.UserData) {
        log(`[resume] No UserData found in metadata for itemId=${itemId} (userId=${userId || "none"})`);
        return null;
      }
      const playbackPositionTicks = metadata.UserData.PlaybackPositionTicks;
      const played = metadata.UserData.Played;
      log(
        `[resume] Item ${itemId} (${metadata.Name || "Unknown"}): PlaybackPositionTicks=${playbackPositionTicks}, Played=${played}, RunTimeTicks=${metadata.RunTimeTicks}`
      );
      if (!playbackPositionTicks || playbackPositionTicks === 0) {
        log(`[resume] No resume position available for itemId=${itemId}`);
        return null;
      }
      if (metadata.RunTimeTicks && playbackPositionTicks / metadata.RunTimeTicks >= WATCHED_THRESHOLD) {
        log(`[resume] Resume position is near the end (>= 95%), starting from beginning for itemId=${itemId}`);
        return null;
      }
      const positionSeconds = ticksToSeconds3(playbackPositionTicks);
      log(`[resume] Found valid resume position: ${positionSeconds.toFixed(1)}s (${playbackPositionTicks} ticks) for itemId=${itemId}`);
      return positionSeconds;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`[resume] Error fetching resume position for itemId=${itemId}: ${errorMsg}`);
      return null;
    }
  }
  async function reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, startPositionSeconds = 0) {
    try {
      if (!preferences2.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping playback start report");
        return false;
      }
      const positionTicks = secondsToTicks3(startPositionSeconds);
      const url = `${serverBase}/Sessions/Playing?api_key=${apiKey}`;
      log(`Reporting playback start for item: ${itemId} at ${startPositionSeconds}s (${positionTicks} ticks)`);
      if (currentPlaybackSession?.isBrowserPlayback) {
        log(`[start] Browser playback mode: reporting playback start event to WebView`);
        if (typeof onProgressUpdated === "function") {
          onProgressUpdated({
            itemId,
            positionTicks,
            isPaused: false,
            event: "start",
            playSessionId
          });
        }
        return true;
      }
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          CanSeek: true,
          PlayMethod: "DirectPlay",
          PositionTicks: positionTicks
        }
      });
      if (response.statusCode >= 400) {
        log(`Playback start failed with status: ${response.statusCode}`);
        return false;
      }
      log(`Playback start reported, status: ${response.statusCode}`);
      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback start: ${errorMsg}`);
      return false;
    }
  }
  async function resumeAndReportStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, userId, knownStartPositionSeconds) {
    const session = currentPlaybackSession;
    try {
      let resumePosition = null;
      if (typeof knownStartPositionSeconds === "number" && knownStartPositionSeconds >= 0) {
        resumePosition = knownStartPositionSeconds;
        log(`[resume] Using known initial start position: ${resumePosition.toFixed(1)}s for itemId=${itemId}`);
      } else if (!session?.isBrowserPlayback) {
        resumePosition = await fetchResumePosition(serverBase, itemId, apiKey, userId);
      }
      if (currentPlaybackSession !== session) {
        log(`Playback session changed while fetching resume position for ${itemId}, aborting start report`);
        return;
      }
      const effectiveStart = resumePosition !== null && resumePosition >= 15 ? resumePosition : 0;
      if (session) {
        session.resumePosition = effectiveStart;
      }
      lastKnownPosition = effectiveStart;
      log(
        `[start] Starting playback for itemId=${itemId}, effectiveStart=${effectiveStart}s (${secondsToTicks3(effectiveStart)} ticks), reporting to Emby...`
      );
      reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, effectiveStart);
      if (effectiveStart >= 15) {
        log(`[seek] Scheduled resume seek to ${effectiveStart.toFixed(1)}s for itemId=${itemId} once playback starts`);
      } else {
        log(`[start] No significant resume position (<15s) for itemId=${itemId}, starting from beginning`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`[start] Error resuming and reporting playback start: ${errorMsg}`);
      reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, 0);
    }
  }
  async function reportPlaybackProgress(serverBase, itemId, apiKey, positionSeconds, playSessionId, mediaSourceId, isPaused = false) {
    try {
      if (!preferences2.get("sync_playback_progress")) {
        return false;
      }
      const positionTicks = secondsToTicks3(positionSeconds);
      if (currentPlaybackSession?.isBrowserPlayback) {
        if (typeof onProgressUpdated === "function") {
          onProgressUpdated({
            itemId,
            positionTicks,
            isPaused,
            event: "progress",
            playSessionId
          });
        }
        return true;
      }
      const url = `${serverBase}/Sessions/Playing/Progress?api_key=${apiKey}`;
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          PositionTicks: positionTicks,
          IsPaused: isPaused,
          CanSeek: true,
          PlayMethod: "DirectPlay"
        }
      });
      if (response.statusCode >= 400) {
        log(`Progress report failed with status: ${response.statusCode}`);
        return false;
      }
      if (typeof onProgressUpdated === "function") {
        onProgressUpdated({ itemId, positionTicks, isPaused });
      }
      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback progress: ${errorMsg}`);
      return false;
    }
  }
  async function reportPlaybackStop(serverBase, itemId, apiKey, positionSeconds, playSessionId, mediaSourceId) {
    try {
      if (!preferences2.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping playback stop report");
        return false;
      }
      const positionTicks = secondsToTicks3(positionSeconds);
      if (currentPlaybackSession?.isBrowserPlayback) {
        log(`[stop] Browser playback mode: reporting playback stop event to WebView`);
        if (typeof onProgressUpdated === "function") {
          onProgressUpdated({
            itemId,
            positionTicks,
            isPaused: false,
            event: "stop",
            playSessionId
          });
        }
        return true;
      }
      const url = `${serverBase}/Sessions/Playing/Stopped?api_key=${apiKey}`;
      log(`Reporting playback stop: position=${positionSeconds}s (${positionTicks} ticks)`);
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          PositionTicks: positionTicks
        }
      });
      if (response.statusCode >= 400) {
        log(`Playback stop failed with status: ${response.statusCode}`);
        return false;
      }
      log(`Playback stop reported, status: ${response.statusCode}`);
      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback stop: ${errorMsg}`);
      return false;
    }
  }
  async function markAsWatched(serverBase, itemId, apiKey) {
    try {
      if (!preferences2.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping mark as watched");
        return false;
      }
      const url = `${serverBase}/UserPlayedItems/${itemId}?api_key=${apiKey}`;
      log(`Marking item as watched: ${itemId}`);
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        })
      });
      if (response.statusCode >= 400) {
        log(`Mark as watched failed with status: ${response.statusCode}`);
        return false;
      }
      log(`Item marked as watched, status: ${response.statusCode}`);
      if ((response.statusCode === 200 || response.statusCode === 204) && preferences2.get("show_notifications")) {
        core2.osd("Marked as watched in Emby");
      }
      return response.statusCode === 200 || response.statusCode === 204;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error marking item as watched: ${errorMsg}`);
      return false;
    }
  }
  async function startPlaybackTracking2(serverBase, itemId, apiKey, userId, knownStartPositionSeconds, isBrowserPlayback) {
    stopPlaybackTracking2();
    if (!preferences2.get("sync_playback_progress")) {
      log("Playback progress sync disabled");
      return;
    }
    log(`Starting playback tracking for item: ${itemId}, isBrowserPlayback: ${Boolean(isBrowserPlayback)}`);
    const requestId = ++sessionRequestCounter;
    let playSessionId = `emby-${Date.now()}`;
    let mediaSourceId = itemId;
    if (!isBrowserPlayback) {
      try {
        const playbackInfo = await fetchPlaybackInfo2(serverBase, itemId, apiKey);
        if (playbackInfo) {
          playSessionId = playbackInfo.PlaySessionId || playSessionId;
          if (playbackInfo.MediaSources && playbackInfo.MediaSources.length > 0) {
            mediaSourceId = playbackInfo.MediaSources[0].Id || mediaSourceId;
          }
          log(`PlaySessionId: ${playSessionId}, MediaSourceId: ${mediaSourceId}`);
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Could not fetch playback info for session: ${errorMsg}`);
      }
    }
    if (requestId !== sessionRequestCounter) {
      log(`Playback tracking for ${itemId} is stale, not starting`);
      return;
    }
    currentPlaybackSession = {
      serverBase,
      itemId,
      apiKey,
      userId,
      playSessionId,
      mediaSourceId,
      startTime: Date.now(),
      resumePosition: typeof knownStartPositionSeconds === "number" && knownStartPositionSeconds >= 15 ? knownStartPositionSeconds : null,
      duration: null,
      hasReportedWatched: false,
      isBrowserPlayback: Boolean(isBrowserPlayback)
    };
    resumeAndReportStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, userId, knownStartPositionSeconds);
    try {
      const duration = core2.status.duration;
      if (duration) {
        currentPlaybackSession.duration = duration;
        log(`Media duration: ${duration}s`);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Could not get duration: ${errorMsg}`);
    }
    startPlaybackTick();
    log("Playback tracking started");
  }
  function startPlaybackTick() {
    stopPlaybackTick();
    playbackTickCount = 0;
    playbackTickTimer = setInterval(() => {
      if (!currentPlaybackSession) {
        stopPlaybackTick();
        return;
      }
      try {
        const position = samplePosition();
        if (position !== null) {
          lastKnownPosition = position;
        }
        if (!currentPlaybackSession.duration) {
          const duration2 = core2.status.duration;
          if (duration2) {
            currentPlaybackSession.duration = duration2;
          }
        }
        const resumePos = currentPlaybackSession.resumePosition;
        if (!currentPlaybackSession.hasPerformedInitialSeek && typeof resumePos === "number" && resumePos >= 15 && position !== null && (currentPlaybackSession.duration || 0) > 0) {
          currentPlaybackSession.hasPerformedInitialSeek = true;
          log(`[seek] Performing safe resume seek to ${resumePos.toFixed(1)}s (current mpv position=${position}s)`);
          try {
            core2.seekTo(resumePos);
            if (preferences2.get("show_notifications")) {
              const minutes = Math.floor(resumePos / 60);
              const seconds = Math.floor(resumePos % 60);
              core2.osd(`Resuming at ${minutes}:${seconds.toString().padStart(2, "0")}`);
            }
          } catch (seekErr) {
            const errorMsg = seekErr instanceof Error ? seekErr.message : String(seekErr);
            log(`[seek] Error during safe resume seek: ${errorMsg}`);
          }
        }
        playbackTickCount++;
        if (playbackTickCount >= PROGRESS_REPORT_TICKS) {
          playbackTickCount = 0;
          const isPaused = core2.status.paused || false;
          const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;
          reportPlaybackProgress(serverBase, itemId, apiKey, lastKnownPosition, playSessionId, mediaSourceId, isPaused);
          lastReportedPosition = lastKnownPosition;
          const duration2 = currentPlaybackSession.duration;
          if (duration2 && !currentPlaybackSession.hasReportedWatched) {
            const percentComplete = lastKnownPosition / duration2;
            log(`Playback progress: ${(percentComplete * 100).toFixed(1)}%`);
            if (percentComplete >= WATCHED_THRESHOLD) {
              log(`Reached ${WATCHED_THRESHOLD * 100}% threshold, marking as watched`);
              markAsWatched(serverBase, itemId, apiKey);
              currentPlaybackSession.hasReportedWatched = true;
            }
          }
        }
        const duration = currentPlaybackSession.duration;
        if (duration && lastKnownPosition > 0) {
          const remaining = duration - lastKnownPosition;
          if (remaining <= 0.5) {
            log("EOF detected via tick, stopping playback tracking");
            if (!currentPlaybackSession.hasReportedWatched) {
              const finished = currentPlaybackSession;
              finished.hasReportedWatched = true;
              markAsWatched(finished.serverBase, finished.itemId, finished.apiKey);
            }
            stopPlaybackTracking2();
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Error in playback tick: ${errorMsg}`);
      }
    }, PLAYBACK_TICK_INTERVAL);
  }
  function stopPlaybackTick() {
    if (playbackTickTimer) {
      clearInterval(playbackTickTimer);
      playbackTickTimer = null;
    }
    playbackTickCount = 0;
  }
  function handlePauseChange2() {
    if (!currentPlaybackSession) return;
    try {
      const position = samplePosition();
      if (position !== null) {
        lastKnownPosition = position;
      }
      const isPaused = core2.status.paused || false;
      const expectedResume = currentPlaybackSession.resumePosition;
      if (typeof expectedResume === "number" && expectedResume >= 15 && lastKnownPosition < 5) {
        log(
          `Pause state changed: isPaused=${isPaused}, position=${lastKnownPosition} (ignoring premature position <5s while resume at ${expectedResume}s is pending)`
        );
        return;
      }
      log(`Pause state changed: isPaused=${isPaused}, position=${lastKnownPosition}`);
      const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;
      reportPlaybackProgress(serverBase, itemId, apiKey, lastKnownPosition, playSessionId, mediaSourceId, isPaused);
      playbackTickCount = 0;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error in pause change handler: ${errorMsg}`);
    }
  }
  function stopPlaybackTracking2() {
    sessionRequestCounter++;
    if (currentPlaybackSession) {
      stopPlaybackTick();
      const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;
      let finalPosition = lastKnownPosition;
      try {
        const position = samplePosition();
        if (position !== null && position > 0) {
          finalPosition = position;
        }
      } catch {
        log(`Could not get final position from core, using lastKnownPosition: ${finalPosition}`);
      }
      if (!hasStartedPlayback || finalPosition === 0) {
        const preserved = currentPlaybackSession.resumePosition ?? lastReportedPosition;
        if (typeof preserved === "number" && preserved > 0) {
          log(`Preserving previous position (${preserved}s) as observed position is 0`);
          finalPosition = preserved;
        }
      }
      reportPlaybackStop(serverBase, itemId, apiKey, finalPosition, playSessionId, mediaSourceId);
      currentPlaybackSession = null;
      lastReportedPosition = 0;
      lastKnownPosition = 0;
      hasStartedPlayback = false;
      log("Playback session ended");
    }
  }
  function getCurrentPlaybackSession2() {
    return currentPlaybackSession;
  }
  return {
    startPlaybackTracking: startPlaybackTracking2,
    stopPlaybackTracking: stopPlaybackTracking2,
    handlePauseChange: handlePauseChange2,
    markAsWatched,
    getCurrentPlaybackSession: getCurrentPlaybackSession2
  };
}

// plugin/src/lib/safe-http.ts
function createSafeHttp(utils2, log) {
  async function request(method, url, options) {
    const timeout = options?.timeoutSeconds ?? 15;
    let finalUrl = url;
    if (options?.params) {
      const q = Object.entries(options.params).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&");
      if (q) {
        finalUrl += (finalUrl.includes("?") ? "&" : "?") + q;
      }
    }
    const args = [
      "-s",
      "-S",
      "-L",
      "--max-time",
      String(timeout),
      "-X",
      method
    ];
    if (options?.headers) {
      for (const [k, v] of Object.entries(options.headers)) {
        args.push("-H", `${k}: ${v}`);
      }
    }
    if (options?.data !== void 0 && options?.data !== null) {
      const payload = typeof options.data === "string" ? options.data : JSON.stringify(options.data);
      args.push("-d", payload);
    }
    args.push("-w", "\n%{http_code}");
    args.push(finalUrl);
    if (log) {
      log(`[safeHttp] ${method} ${finalUrl}`);
    }
    const res = await utils2.exec("/usr/bin/curl", args);
    if (res.status !== 0 && !res.stdout) {
      const errMsg = `curl ${method} failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp] ${errMsg}`);
      throw new Error(errMsg);
    }
    const stdout = res.stdout || "";
    const lastNl = stdout.lastIndexOf("\n");
    let body = stdout;
    let statusCode = 200;
    if (lastNl !== -1) {
      body = stdout.substring(0, lastNl);
      const codeStr = stdout.substring(lastNl + 1).trim();
      const parsed = parseInt(codeStr, 10);
      if (!isNaN(parsed) && parsed > 0) {
        statusCode = parsed;
      }
    }
    let data = body;
    if (body) {
      try {
        data = JSON.parse(body);
      } catch {
      }
    }
    return {
      status: statusCode,
      statusCode,
      data,
      text: body
    };
  }
  async function download(url, destPath, timeoutSeconds = 30) {
    const resolved = typeof utils2.resolvePath === "function" ? utils2.resolvePath(destPath) : destPath;
    if (log) {
      log(`[safeHttp] Download ${url} -> ${resolved}`);
    }
    if (resolved && resolved.includes("/")) {
      const dir = resolved.substring(0, resolved.lastIndexOf("/"));
      try {
        await utils2.exec("/bin/mkdir", ["-p", dir]);
      } catch {
      }
    }
    const args = [
      "-s",
      "-S",
      "-f",
      "-L",
      "--max-time",
      String(timeoutSeconds),
      "-o",
      resolved,
      url
    ];
    const res = await utils2.exec("/usr/bin/curl", args);
    if (res.status !== 0) {
      const errMsg = `curl download failed with exit code ${res.status}: ${res.stderr || "unknown error"}`;
      if (log) log.error(`[safeHttp] ${errMsg}`);
      throw new Error(errMsg);
    }
  }
  return {
    get: (url, opts) => request("GET", url, opts),
    post: (url, opts) => request("POST", url, opts),
    put: (url, opts) => request("PUT", url, opts),
    delete: (url, opts) => request("DELETE", url, opts),
    download
  };
}

// plugin/src/lib/server-session-store.ts
function createServerSessionStore({ preferences: preferences2, sidebar, standaloneWindow, log }) {
  function notifyViews(name, data) {
    for (const view of [sidebar, standaloneWindow]) {
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
  function storeEmbySession2(serverBase, apiKey) {
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
  function getStoredEmbySession2() {
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
    storeEmbySession: storeEmbySession2,
    clearEmbySession,
    getStoredEmbySession: getStoredEmbySession2
  };
}

// plugin/src/lib/track-matcher.ts
var LANGUAGE_CANONICAL_MAP = {
  // Chinese
  chi: "zh",
  zho: "zh",
  zh: "zh",
  cmn: "zh",
  chinese: "zh",
  \u4E2D\u6587: "zh",
  \u6C49\u8BED: "zh",
  \u6F22\u8A9E: "zh",
  // English
  eng: "en",
  en: "en",
  english: "en",
  \u82F1\u6587: "en",
  \u82F1\u8BED: "en",
  // Japanese
  jpn: "ja",
  ja: "ja",
  japanese: "ja",
  \u65E5\u6587: "ja",
  \u65E5\u8BED: "ja",
  // Korean
  kor: "ko",
  ko: "ko",
  korean: "ko",
  \u97E9\u6587: "ko",
  \u97E9\u8BED: "ko",
  // French
  fre: "fr",
  fra: "fr",
  fr: "fr",
  french: "fr",
  \u6CD5\u6587: "fr",
  \u6CD5\u8BED: "fr",
  // German
  ger: "de",
  deu: "de",
  de: "de",
  german: "de",
  \u5FB7\u6587: "de",
  \u5FB7\u8BED: "de",
  // Spanish
  spa: "es",
  es: "es",
  spanish: "es",
  \u897F\u73ED\u7259\u8BED: "es",
  // Russian
  rus: "ru",
  ru: "ru",
  russian: "ru",
  \u4FC4\u6587: "ru",
  \u4FC4\u8BED: "ru",
  // Italian
  ita: "it",
  it: "it",
  italian: "it",
  \u610F\u5927\u5229\u8BED: "it",
  // Portuguese
  por: "pt",
  pt: "pt",
  portuguese: "pt",
  \u8461\u8404\u7259\u8BED: "pt",
  // Vietnamese
  vie: "vi",
  vi: "vi",
  vietnamese: "vi",
  \u8D8A\u5357\u8BED: "vi",
  // Thai
  tha: "th",
  th: "th",
  thai: "th",
  \u6CF0\u6587: "th",
  \u6CF0\u8BED: "th",
  // Arabic
  ara: "ar",
  ar: "ar",
  arabic: "ar",
  \u963F\u62C9\u4F2F\u8BED: "ar",
  // Cantonese
  yue: "yue",
  cantonese: "yue",
  \u7CA4\u8BED: "yue",
  \u5E7F\u4E1C\u8BDD: "yue"
};
function canonicalizeLanguage(lang) {
  if (!lang) return null;
  const clean = lang.trim().toLowerCase();
  if (LANGUAGE_CANONICAL_MAP[clean]) {
    return LANGUAGE_CANONICAL_MAP[clean];
  }
  const prefix = clean.split(/[-_]/)[0];
  if (LANGUAGE_CANONICAL_MAP[prefix]) {
    return LANGUAGE_CANONICAL_MAP[prefix];
  }
  return clean;
}
function detectChineseVariant(text) {
  if (!text) return "unknown";
  const clean = text.toLowerCase();
  if (clean.includes("simplified") || clean.includes("hans") || clean.includes("chs") || clean.includes("sc") || clean.includes("\u7B80\u4F53") || clean.includes("\u7B80\u4E2D") || clean.includes("\u7B80")) {
    return "simplified";
  }
  if (clean.includes("traditional") || clean.includes("hant") || clean.includes("cht") || clean.includes("tc") || clean.includes("\u7E41\u4F53") || clean.includes("\u7E41\u4E2D") || clean.includes("\u7E41")) {
    return "traditional";
  }
  return "unknown";
}
function findMatchingSubtitleTrack(subTracks, criteria) {
  if (!Array.isArray(subTracks) || subTracks.length === 0) {
    return void 0;
  }
  const { trackNumber, streamIndex, language, title, codec } = criteria;
  const targetCanonLang = canonicalizeLanguage(language);
  const targetVariant = detectChineseVariant((title || "") + " " + (language || ""));
  let bestMatch;
  let highestScore = -1;
  for (let i = 0; i < subTracks.length; i++) {
    const track = subTracks[i];
    let score = 0;
    const trackCanonLang = canonicalizeLanguage(track.lang);
    const trackVariant = detectChineseVariant((track.title || "") + " " + (track.lang || ""));
    const isPositionMatch = typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1;
    if (isPositionMatch) {
      score += 100;
    }
    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }
    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
      if (targetCanonLang === "zh") {
        if (targetVariant !== "unknown" && trackVariant !== "unknown") {
          if (targetVariant === trackVariant) {
            score += 60;
          } else {
            score -= 50;
          }
        }
      }
    }
    if (title && track.title) {
      const cleanTargetTitle = title.trim().toLowerCase();
      const cleanTrackTitle = track.title.trim().toLowerCase();
      if (cleanTrackTitle === cleanTargetTitle) {
        score += 40;
      } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
        score += 25;
      }
    }
    if (codec && track.codec) {
      const cleanTargetCodec = codec.trim().toLowerCase();
      const cleanTrackCodec = track.codec.trim().toLowerCase();
      if (cleanTrackCodec.includes(cleanTargetCodec) || cleanTargetCodec.includes(cleanTrackCodec)) {
        score += 10;
      }
    }
    if (typeof trackNumber === "number" && track.id === trackNumber || typeof streamIndex === "number" && track.id === streamIndex) {
      score += 15;
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }
  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }
  if (typeof trackNumber === "number" && trackNumber > 0 && trackNumber <= subTracks.length) {
    return subTracks[trackNumber - 1];
  }
  return void 0;
}
function findMatchingAudioTrack(audioTracks, criteria) {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return void 0;
  }
  const { trackNumber, streamIndex, language, title } = criteria;
  const targetCanonLang = canonicalizeLanguage(language);
  let bestMatch;
  let highestScore = -1;
  for (let i = 0; i < audioTracks.length; i++) {
    const track = audioTracks[i];
    let score = 0;
    const trackCanonLang = canonicalizeLanguage(track.lang);
    if (typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1) {
      score += 100;
    }
    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }
    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
    }
    if (title && track.title) {
      const cleanTargetTitle = title.trim().toLowerCase();
      const cleanTrackTitle = track.title.trim().toLowerCase();
      if (cleanTrackTitle === cleanTargetTitle) {
        score += 40;
      } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
        score += 25;
      }
    }
    if (typeof trackNumber === "number" && track.id === trackNumber || typeof streamIndex === "number" && track.id === streamIndex) {
      score += 15;
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }
  if (bestMatch && highestScore > 0) {
    return bestMatch;
  }
  if (typeof trackNumber === "number" && trackNumber > 0 && trackNumber <= audioTracks.length) {
    return audioTracks[trackNumber - 1];
  }
  return void 0;
}

// plugin/src/index.ts
var { core, console: iinaConsole, menu, event, http, utils, preferences, mpv, global: iinaGlobal, file } = iina;
var debugLog = createDebugLogger(preferences, iinaConsole, file);
var safeHttp = createSafeHttp(utils, debugLog);
var { buildEmbyHeaders: buildEmbyHeaders2, parseEmbyUrl, isEmbyUrl, fetchPlaybackInfo, fetchItemMetadata, secondsToTicks: secondsToTicks2, ticksToSeconds: ticksToSeconds2 } = createEmbyApi({
  http: safeHttp,
  preferences,
  log: debugLog
});
var serverSessionStore = createServerSessionStore({
  preferences,
  log: debugLog
});
var { storeEmbySession, getStoredEmbySession } = serverSessionStore;
debugLog("Emby Plugin loaded");
var { startPlaybackTracking, stopPlaybackTracking, handlePauseChange, getCurrentPlaybackSession } = createPlaybackTrackingManager({
  core,
  http: safeHttp,
  preferences,
  buildEmbyHeaders: buildEmbyHeaders2,
  fetchPlaybackInfo,
  fetchItemMetadata,
  secondsToTicks: secondsToTicks2,
  ticksToSeconds: ticksToSeconds2,
  onProgressUpdated: (data) => {
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("playback-progress-updated", data);
    }
  },
  log: debugLog
});
var isWindowClosing = false;
var { setupAutoplayForEpisode, resetForNewFile, clearQueuedFlag, isQueued } = createAutoplayManager({
  http: safeHttp,
  mpv,
  core,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  isClosing: () => isWindowClosing,
  buildEmbyHeaders: buildEmbyHeaders2,
  fetchItemMetadata,
  log: debugLog
});
var { setVideoTitleFromMetadata, downloadAllSubtitles, downloadExternalSubtitle, manualDownloadSubtitles, manualSetTitle, updateFromFileUrl } = createMediaActionsManager({
  core,
  http: safeHttp,
  utils,
  preferences,
  mpv,
  parseEmbyUrl,
  isEmbyUrl,
  fetchPlaybackInfo,
  fetchItemMetadata,
  getActiveSession: getStoredEmbySession,
  log: debugLog
});
var {
  handlePlayMedia,
  handlePlayMediaList,
  flushPendingPlaylistQueue,
  consumeReplacementGuard,
  markLaunchedFromBrowser,
  clearLaunchedFromBrowser,
  consumeLaunchedFromBrowser,
  isLaunchedFromBrowser,
  getPendingMediaTitle,
  getPendingStartPosition,
  getPendingAudioIndex,
  getPendingSubtitleIndex,
  getPendingAudioTrackNumber,
  getPendingSubtitleTrackNumber,
  getPendingAudioLanguage,
  getPendingSubtitleLanguage,
  getPendingIsExternalSubtitle,
  getPendingSubtitlePath,
  getPendingSubtitleCodec,
  getPendingMediaSourceId,
  getPendingSubtitleDeliveryUrl,
  getPendingSubtitleTitle,
  clearPendingSubtitle,
  clearPendingAudio,
  clearPendingTracks,
  setPendingPlaybackData
} = createPlaybackCoordinator({
  core,
  mpv,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  getCurrentPlaybackSession,
  clearQueuedFlag,
  log: debugLog
});
if (iinaGlobal && typeof iinaGlobal.getLabel === "function") {
  const label = iinaGlobal.getLabel();
  if (label?.startsWith("emby-")) {
    debugLog(`Player instance opened with label ${label}, marking as browser playback`);
    markLaunchedFromBrowser();
  }
}
if (iinaGlobal && typeof iinaGlobal.onMessage === "function") {
  iinaGlobal.onMessage("play-media-command", (data) => {
    debugLog("Received play-media-command from global entry", data);
    isWindowClosing = false;
    isDownloadingExternalSubtitle = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMedia(data);
  });
  iinaGlobal.onMessage("play-media-list-command", (data) => {
    debugLog("Received play-media-list-command from global entry", data);
    isWindowClosing = false;
    isDownloadingExternalSubtitle = false;
    currentLoadedFileUrl = null;
    resetForNewFile();
    clearQueuedFlag();
    markLaunchedFromBrowser();
    handlePlayMediaList(data);
  });
  iinaGlobal.onMessage("apply-pending-media", (data) => {
    debugLog("Received apply-pending-media from global entry", data);
    if (!data) return;
    markLaunchedFromBrowser();
    setPendingPlaybackData(data);
    const startPosSeconds = typeof data.startPositionSeconds === "number" && data.startPositionSeconds > 0 ? data.startPositionSeconds : typeof data.startPositionTicks === "number" && data.startPositionTicks > 0 ? ticksToSeconds2(data.startPositionTicks) : null;
    if (typeof startPosSeconds === "number" && startPosSeconds > 0) {
      try {
        const timePos = mpv.getNumber("time-pos") || 0;
        if (timePos < 2) {
          debugLog(`Seeking to pending start position: ${startPosSeconds}s`);
          mpv.set("time-pos", startPosSeconds);
        }
      } catch {
      }
    }
    const applyTracksNow = () => {
      const resolvedUrl = getEffectiveFileUrl();
      if (!resolvedUrl) return;
      const embyInfo = parseEmbyUrl(resolvedUrl);
      if (!embyInfo) return;
      let reportServerBase = embyInfo.serverBase;
      let reportApiKey = embyInfo.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    };
    applyTracksNow();
    setTimeout(applyTracksNow, 200);
    setTimeout(applyTracksNow, 600);
    setTimeout(applyTracksNow, 1200);
  });
}
if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
  iinaGlobal.postMessage("get-pending-media", {});
  iinaGlobal.postMessage("player-active", {});
}
var currentLoadedFileUrl = null;
function getEffectiveFileUrl(fileUrl) {
  if (fileUrl && typeof fileUrl === "string") {
    return fileUrl;
  }
  try {
    if (core.status?.url) {
      return core.status.url;
    }
  } catch {
  }
  try {
    const mpvPath = mpv.getString("path");
    if (mpvPath) {
      return mpvPath;
    }
  } catch {
  }
  return void 0;
}
var targetSidToEnforce = null;
var targetAidToEnforce = null;
var enforcementStartTime = 0;
var enforcementReapplyCount = 0;
var enforcementItemId = null;
var ENFORCEMENT_DURATION_MS = 1e4;
var MAX_ENFORCEMENT_REAPPLIES = 8;
var enforcementTimer = null;
function startEnforcingTracks(itemId, sid, aid) {
  enforcementItemId = itemId;
  if (sid !== null) {
    targetSidToEnforce = sid;
  }
  if (aid !== null) {
    targetAidToEnforce = aid;
  }
  enforcementStartTime = Date.now();
  enforcementReapplyCount = 0;
  if (enforcementTimer) {
    clearTimeout(enforcementTimer);
  }
  enforcementTimer = setTimeout(() => {
    const expiredItemId = enforcementItemId;
    stopEnforcingTracks();
    if (expiredItemId) {
      clearPendingTracks(expiredItemId);
    }
  }, ENFORCEMENT_DURATION_MS);
}
function stopEnforcingTracks() {
  if (enforcementTimer) {
    clearTimeout(enforcementTimer);
    enforcementTimer = null;
  }
  targetSidToEnforce = null;
  targetAidToEnforce = null;
  enforcementStartTime = 0;
  enforcementReapplyCount = 0;
  enforcementItemId = null;
}
function applySelectedAudioTrack(itemId) {
  const pendingAudio = getPendingAudioIndex(itemId);
  const pendingAudioTrackNum = getPendingAudioTrackNumber(itemId);
  const pendingAudioLang = getPendingAudioLanguage(itemId);
  if (typeof pendingAudio !== "number" && typeof pendingAudioTrackNum !== "number") {
    return;
  }
  try {
    debugLog(`Applying user-selected audio track: Index=${pendingAudio}, TrackNum=${pendingAudioTrackNum}, Lang=${pendingAudioLang}`);
    const trackList = mpv.getNative("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      return;
    }
    const audioTracks = trackList.filter((t) => t.type === "audio");
    if (audioTracks.length === 0) {
      debugLog("No audio tracks found in mpv track-list");
      return;
    }
    const match = findMatchingAudioTrack(audioTracks, {
      trackNumber: pendingAudioTrackNum,
      streamIndex: pendingAudio,
      language: pendingAudioLang
    });
    const targetAid = match && typeof match.id === "number" ? match.id : typeof pendingAudioTrackNum === "number" && pendingAudioTrackNum > 0 ? pendingAudioTrackNum : null;
    if (targetAid !== null) {
      const currentAid = mpv.getString("aid") || "";
      const aidStr = String(targetAid);
      debugLog(`Applying audio track targetAid=${targetAid}, current mpv.aid=${currentAid}`);
      if (currentAid !== aidStr) {
        debugLog(`Setting audio track id: ${aidStr} (current was ${currentAid})`);
        try {
          if (core?.audio) {
            core.audio.currentTrack = targetAid;
          }
        } catch {
        }
        try {
          mpv.set("aid", aidStr);
        } catch (e) {
          debugLog("mpv.set aid error:", e);
        }
      }
      startEnforcingTracks(itemId, null, targetAid);
    }
  } catch (err) {
    debugLog("Failed to set audio track:", err);
  }
}
var isDownloadingExternalSubtitle = false;
async function applySelectedSubtitleTrack(serverBase, itemId, apiKey) {
  const pendingSubtitle = getPendingSubtitleIndex(itemId);
  const pendingSubTrackNum = getPendingSubtitleTrackNumber(itemId);
  const pendingSubLang = getPendingSubtitleLanguage(itemId);
  const isExternal = getPendingIsExternalSubtitle(itemId);
  const subCodec = getPendingSubtitleCodec(itemId);
  const subPath = getPendingSubtitlePath(itemId);
  const mediaSourceId = getPendingMediaSourceId(itemId);
  const deliveryUrl = getPendingSubtitleDeliveryUrl(itemId);
  const subtitleTitle = getPendingSubtitleTitle(itemId);
  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number") {
    return;
  }
  if (pendingSubtitle === -1) {
    debugLog("User selected to turn off subtitles");
    try {
      const currentSid = mpv.getString("sid");
      if (currentSid !== "no" && currentSid !== "0") {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      }
    } catch {
    }
    startEnforcingTracks(itemId, "no", null);
    return;
  }
  if (isExternal && typeof pendingSubtitle === "number") {
    const effectiveUrl = getEffectiveFileUrl();
    if (!effectiveUrl) {
      debugLog("Playback not ready yet, deferring external subtitle load to file-loaded event");
      return;
    }
    if (isDownloadingExternalSubtitle) {
      debugLog("External subtitle download already in progress, skipping duplicate call");
      return;
    }
    debugLog(`Selected subtitle is external (Index: ${pendingSubtitle}, MediaSourceId: ${mediaSourceId || "none"}). Downloading and loading...`);
    try {
      isDownloadingExternalSubtitle = true;
      const loaded = await downloadExternalSubtitle(
        serverBase,
        itemId,
        mediaSourceId || null,
        pendingSubtitle,
        subPath || void 0,
        apiKey,
        pendingSubLang || "und",
        subCodec || "srt",
        deliveryUrl || null,
        subtitleTitle || null
      );
      if (loaded) {
        debugLog("External subtitle loaded successfully");
        clearPendingSubtitle(itemId);
        return;
      } else {
        debugLog("External subtitle download returned false, will retry on file-loaded if still pending");
      }
    } catch (err) {
      debugLog("Failed to load selected external subtitle:", err);
    } finally {
      isDownloadingExternalSubtitle = false;
    }
    return;
  }
  try {
    debugLog(
      `Applying embedded subtitle track: Index=${pendingSubtitle}, TrackNum=${pendingSubTrackNum}, Lang=${pendingSubLang}, Title=${subtitleTitle}`
    );
    const trackList = mpv.getNative("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      debugLog("Tracks not ready yet in track-list, will be applied on tracks-changed");
      return;
    }
    const subTracks = trackList.filter((t) => t.type === "sub");
    if (subTracks.length === 0) {
      debugLog("No subtitle tracks found in mpv track-list yet, will be applied on tracks-changed");
      return;
    }
    const match = findMatchingSubtitleTrack(subTracks, {
      trackNumber: pendingSubTrackNum,
      streamIndex: pendingSubtitle,
      language: pendingSubLang,
      title: subtitleTitle,
      codec: subCodec
    });
    const targetSid = match && typeof match.id === "number" ? match.id : typeof pendingSubTrackNum === "number" && pendingSubTrackNum > 0 ? pendingSubTrackNum : null;
    if (targetSid !== null) {
      const currentSid = mpv.getString("sid") || "";
      const sidStr = String(targetSid);
      debugLog(
        `Applying subtitle track targetSid=${targetSid} (matched id: ${match?.id}, lang: ${match?.lang}, title: ${match?.title}), current mpv.sid=${currentSid}`
      );
      if (currentSid !== sidStr) {
        debugLog(`Setting subtitle track id: ${sidStr} (current was ${currentSid})`);
        try {
          if (core?.subtitle) {
            core.subtitle.currentTrack = targetSid;
          }
        } catch {
        }
        try {
          mpv.set("sid", sidStr);
          mpv.set("sub-visibility", true);
        } catch (e) {
          debugLog("mpv.set sid error:", e);
        }
      }
      startEnforcingTracks(itemId, targetSid, null);
    }
  } catch (err) {
    debugLog("Failed to set subtitle track:", err);
  }
}
function onFileLoaded(fileUrl) {
  isWindowClosing = false;
  const resolvedUrl = getEffectiveFileUrl(fileUrl);
  debugLog(`File loaded event: raw=${fileUrl}, resolved=${resolvedUrl}`);
  if (!resolvedUrl) {
    debugLog("No resolved URL found on file loaded");
    return;
  }
  if (currentLoadedFileUrl === resolvedUrl) {
    debugLog(`File ${resolvedUrl} already initialized, re-checking pending tracks`);
    const embyInfo2 = parseEmbyUrl(resolvedUrl);
    if (embyInfo2) {
      let reportServerBase = embyInfo2.serverBase;
      let reportApiKey = embyInfo2.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo2.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo2.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo2.itemId, reportApiKey);
    }
    return;
  }
  currentLoadedFileUrl = resolvedUrl;
  stopEnforcingTracks();
  flushPendingPlaylistQueue(resolvedUrl);
  stopPlaybackTracking();
  const embyInfo = updateFromFileUrl(resolvedUrl);
  if (!embyInfo) {
    clearLaunchedFromBrowser();
  } else {
    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;
    let reportUserId;
    const session = getStoredEmbySession();
    if (session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
      reportUserId = session.userId;
      if (preferences.get("use_connected_account")) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        debugLog(
          `Connected-account mode: reporting as ${session.username || session.serverName} @ ${reportServerBase} (ignoring URL api_key)`
        );
      }
    } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
      reportUserId = session.userId;
    } else if (preferences.get("auto_login_enabled")) {
      storeEmbySession(embyInfo.serverBase, embyInfo.apiKey);
    } else {
      debugLog("Auto-login from Emby URLs disabled, not storing the URL credentials");
    }
    try {
      mpv.set("start", "none");
    } catch {
    }
    const isBrowser = isLaunchedFromBrowser();
    if (preferences.get("sync_playback_progress")) {
      const pendingStart = getPendingStartPosition(embyInfo.itemId);
      debugLog(
        `Starting playback tracking for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}, pendingStart: ${pendingStart ?? "none"}, isBrowser: ${isBrowser}`
      );
      startPlaybackTracking(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId, pendingStart, isBrowser);
    }
    if (preferences.get("set_video_title")) {
      const knownTitle = getPendingMediaTitle(embyInfo.itemId);
      if (knownTitle) {
        try {
          mpv.set("force-media-title", knownTitle);
          debugLog(`Pre-set video title from known playback title: ${knownTitle}`);
        } catch {
        }
      } else if (!isBrowser) {
        debugLog(`Setting video title from metadata for: ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
        setVideoTitleFromMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      }
    }
    if (!isBrowser && preferences.get("autoplay_next_episode")) {
      debugLog(`Setting up autoplay for episode (itemId): ${embyInfo.itemId}, userId: ${reportUserId || "none"}`);
      resetForNewFile();
      setupAutoplayForEpisode(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }
    const applyTracksNow = () => {
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    };
    applyTracksNow();
    setTimeout(applyTracksNow, 250);
    setTimeout(applyTracksNow, 750);
    setTimeout(applyTracksNow, 1500);
    const pendingSubtitle = getPendingSubtitleIndex(embyInfo.itemId);
    if (!isBrowser && pendingSubtitle !== -1 && preferences.get("auto_download_enabled")) {
      debugLog(`Auto-downloading subtitles for: ${embyInfo.itemId}`);
      const hasSpecificSubSelected = typeof pendingSubtitle === "number";
      downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey).then(() => {
        if (hasSpecificSubSelected) {
          applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
        }
      });
    } else if (pendingSubtitle === -1) {
      debugLog("Subtitles turned off by user, skipping auto-download of external subtitles");
      try {
        const currentSid = mpv.getString("sid");
        if (currentSid !== "no" && currentSid !== "0") {
          mpv.set("sid", "no");
          mpv.command("set", ["sid", "no"]);
        }
      } catch {
      }
      startEnforcingTracks(embyInfo.itemId, "no", null);
    }
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("player-file-loaded", {
        itemId: embyInfo.itemId,
        url: resolvedUrl
      });
      iinaGlobal.postMessage("player-active", {
        itemId: embyInfo.itemId,
        url: resolvedUrl
      });
    }
  }
}
function handlePlaybackTermination(reason) {
  const shouldReopen = preferences.get("reopen_browser_on_playback_end") !== false;
  if (shouldReopen && consumeLaunchedFromBrowser()) {
    console.log(`[iina-emby] Playback terminated (${reason}), requesting global reopen`);
    debugLog(`Playback terminated (${reason}) for media launched from browser, requesting global reopen`);
    if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
      iinaGlobal.postMessage("reopen-browser", {});
    }
  }
}
menu.addItem(menu.item("Download Emby Subtitles", manualDownloadSubtitles));
menu.addItem(menu.item("Set Emby Title", manualSetTitle));
event.on("iina.file-loaded", onFileLoaded);
event.on("iina.file-started", () => {
  isWindowClosing = false;
});
event.on("mpv.file-loaded", () => {
  isWindowClosing = false;
  onFileLoaded();
});
var handleTracksChanged = () => {
  if (isWindowClosing) return;
  const resolvedUrl = getEffectiveFileUrl();
  debugLog(`Track list changed event received for URL: ${resolvedUrl}`);
  if (resolvedUrl) {
    const embyInfo = parseEmbyUrl(resolvedUrl);
    if (embyInfo) {
      let reportServerBase = embyInfo.serverBase;
      let reportApiKey = embyInfo.apiKey;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
      }
      applySelectedAudioTrack(embyInfo.itemId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey);
    }
  }
};
event.on("mpv.track-list.changed", handleTracksChanged);
event.on("mpv.tracks-changed", handleTracksChanged);
event.on("mpv.sid.changed", (newSidVal) => {
  if (isWindowClosing || targetSidToEnforce === null) return;
  const elapsed = Date.now() - enforcementStartTime;
  if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
    debugLog(`Track enforcement window ended for sid (elapsed=${elapsed}ms, reapplies=${enforcementReapplyCount})`);
    targetSidToEnforce = null;
    return;
  }
  const currentSidStr = String(newSidVal ?? "");
  if (targetSidToEnforce === "no") {
    if (currentSidStr !== "no" && currentSidStr !== "0" && currentSidStr !== "false" && newSidVal !== null) {
      debugLog(`Enforcement: Re-disabling subtitles (was set to ${newSidVal} by player core)`);
      enforcementReapplyCount++;
      try {
        if (core?.subtitle) {
          core.subtitle.currentTrack = null;
        }
      } catch {
      }
      try {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      } catch (err) {
        debugLog("Error re-disabling subtitles:", err);
      }
    }
  } else if (targetSidToEnforce !== null) {
    const targetStr = String(targetSidToEnforce);
    if (currentSidStr !== targetStr) {
      debugLog(`Enforcement: Re-applying target subtitle track ${targetStr} (was set to ${newSidVal} by player core)`);
      enforcementReapplyCount++;
      try {
        if (core?.subtitle) {
          core.subtitle.currentTrack = targetSidToEnforce;
        }
      } catch {
      }
      try {
        mpv.set("sid", targetStr);
        mpv.set("sub-visibility", true);
      } catch (err) {
        debugLog("Error re-applying subtitle track:", err);
      }
    }
  }
});
event.on("mpv.aid.changed", (newAidVal) => {
  if (isWindowClosing || targetAidToEnforce === null) return;
  const elapsed = Date.now() - enforcementStartTime;
  if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
    targetAidToEnforce = null;
    return;
  }
  const currentAidStr = String(newAidVal ?? "");
  const targetStr = String(targetAidToEnforce);
  if (currentAidStr !== targetStr) {
    debugLog(`Enforcement: Re-applying target audio track ${targetStr} (was set to ${newAidVal})`);
    enforcementReapplyCount++;
    try {
      if (core?.audio) {
        core.audio.currentTrack = targetAidToEnforce;
      }
    } catch {
    }
    try {
      mpv.set("aid", targetStr);
    } catch (err) {
      debugLog("Error re-applying audio track:", err);
    }
  }
});
event.on("mpv.path.changed", (newPath) => {
  if (typeof newPath === "string" && newPath.trim().length > 0) {
    isWindowClosing = false;
    currentLoadedFileUrl = null;
    onFileLoaded(newPath);
  }
});
event.on("iina.window-loaded", () => {
  debugLog("Window loaded event received");
  isWindowClosing = false;
});
event.on("mpv.playlist-pos.changed", () => {
  if (isWindowClosing) return;
  onFileLoaded();
});
event.on("mpv.pause.changed", () => {
  if (isWindowClosing) return;
  handlePauseChange();
});
event.on("mpv.end-file", () => {
  if (isWindowClosing) {
    debugLog("Window is closing, skipping mpv.end-file handler");
    return;
  }
  const queuedForAutoplay = isQueued();
  const isReplacingPlayback = consumeReplacementGuard();
  let hasMoreInPlaylist = false;
  try {
    const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
    const currentPos = Number(mpv.getNumber("playlist-pos") || 0);
    hasMoreInPlaylist = playlistCount > 0 && currentPos < playlistCount - 1;
  } catch {
  }
  debugLog(
    `mpv.end-file triggered, isReplacingPlayback=${isReplacingPlayback}, autoplayQueued=${queuedForAutoplay}, hasMoreInPlaylist=${hasMoreInPlaylist}`
  );
  if (isReplacingPlayback) {
    debugLog("File replacement in progress, skipping stop report");
    return;
  }
  if (queuedForAutoplay || hasMoreInPlaylist) {
    debugLog("More episodes in playlist, mpv will play next episode \u2014 skipping stop cleanup");
    clearQueuedFlag();
    currentLoadedFileUrl = null;
    return;
  }
  currentLoadedFileUrl = null;
  stopEnforcingTracks();
  clearPendingTracks();
  stopPlaybackTracking();
  handlePlaybackTermination("end-file");
});
event.on("iina.window-will-close", () => {
  if (isWindowClosing) return;
  isWindowClosing = true;
  debugLog("Window closing, stopping playback tracking");
  currentLoadedFileUrl = null;
  resetForNewFile();
  clearQueuedFlag();
  stopEnforcingTracks();
  clearPendingTracks();
  if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
    iinaGlobal.postMessage("player-unregistered", {});
    iinaGlobal.postMessage("player-inactive", {});
  }
  stopPlaybackTracking();
  handlePlaybackTermination("window-close");
});
event.on("iina.application-will-terminate", () => {
  isWindowClosing = true;
  debugLog("Application terminating, stopping playback tracking");
  stopPlaybackTracking();
});
