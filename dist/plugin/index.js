"use strict";

// shared/constants.ts
var CLIENT_NAME = "IINA Emby Plugin";
var DEVICE_NAME = "IINA";
var CLIENT_VERSION = true ? "0.8.1" : "0.1.0";

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

// shared/utils/subtitle.ts
var SUBTITLE_LANG_MAP = {
  chi: { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  zho: { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  zh: { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  "zh-cn": { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  "zh-hans": { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  chs: { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  sc: { lang: "chi", name: "\u7B80\u4F53\u4E2D\u6587" },
  "zh-tw": { lang: "chi", name: "\u7E41\u4F53\u4E2D\u6587" },
  "zh-hk": { lang: "chi", name: "\u7E41\u4F53\u4E2D\u6587" },
  "zh-hant": { lang: "chi", name: "\u7E41\u4F53\u4E2D\u6587" },
  cht: { lang: "chi", name: "\u7E41\u4F53\u4E2D\u6587" },
  tc: { lang: "chi", name: "\u7E41\u4F53\u4E2D\u6587" },
  eng: { lang: "eng", name: "\u82F1\u8BED" },
  en: { lang: "eng", name: "\u82F1\u8BED" },
  jpn: { lang: "jpn", name: "\u65E5\u8BED" },
  ja: { lang: "jpn", name: "\u65E5\u8BED" },
  kor: { lang: "kor", name: "\u97E9\u8BED" },
  ko: { lang: "kor", name: "\u97E9\u8BED" },
  fre: { lang: "fre", name: "\u6CD5\u8BED" },
  fra: { lang: "fre", name: "\u6CD5\u8BED" },
  fr: { lang: "fre", name: "\u6CD5\u8BED" },
  ger: { lang: "ger", name: "\u5FB7\u8BED" },
  deu: { lang: "ger", name: "\u5FB7\u8BED" },
  de: { lang: "ger", name: "\u5FB7\u8BED" },
  spa: { lang: "spa", name: "\u897F\u73ED\u7259\u8BED" },
  es: { lang: "spa", name: "\u897F\u73ED\u7259\u8BED" },
  rus: { lang: "rus", name: "\u4FC4\u8BED" },
  ru: { lang: "rus", name: "\u4FC4\u8BED" },
  ita: { lang: "ita", name: "\u610F\u5927\u5229\u8BED" },
  it: { lang: "ita", name: "\u610F\u5927\u5229\u8BED" },
  por: { lang: "por", name: "\u8461\u8404\u7259\u8BED" },
  pt: { lang: "por", name: "\u8461\u8404\u7259\u8BED" },
  "pt-br": { lang: "por", name: "\u8461\u8404\u7259\u8BED(\u5DF4\u897F)" },
  tha: { lang: "tha", name: "\u6CF0\u8BED" },
  th: { lang: "tha", name: "\u6CF0\u8BED" },
  vie: { lang: "vie", name: "\u8D8A\u5357\u8BED" },
  vi: { lang: "vie", name: "\u8D8A\u5357\u8BED" },
  ara: { lang: "ara", name: "\u963F\u62C9\u4F2F\u8BED" },
  ar: { lang: "ara", name: "\u963F\u62C9\u4F2F\u8BED" },
  yue: { lang: "yue", name: "\u7CA4\u8BED" },
  cantonese: { lang: "yue", name: "\u7CA4\u8BED" },
  dan: { lang: "dan", name: "\u4E39\u9EA6\u8BED" },
  da: { lang: "dan", name: "\u4E39\u9EA6\u8BED" },
  nl: { lang: "dut", name: "\u8377\u5170\u8BED" },
  dut: { lang: "dut", name: "\u8377\u5170\u8BED" },
  nld: { lang: "dut", name: "\u8377\u5170\u8BED" },
  fin: { lang: "fin", name: "\u82AC\u5170\u8BED" },
  fi: { lang: "fin", name: "\u82AC\u5170\u8BED" },
  gre: { lang: "gre", name: "\u5E0C\u814A\u8BED" },
  ell: { lang: "gre", name: "\u5E0C\u814A\u8BED" },
  el: { lang: "gre", name: "\u5E0C\u814A\u8BED" },
  heb: { lang: "heb", name: "\u5E0C\u4F2F\u6765\u8BED" },
  he: { lang: "heb", name: "\u5E0C\u4F2F\u6765\u8BED" },
  hin: { lang: "hin", name: "\u5370\u5730\u8BED" },
  hi: { lang: "hin", name: "\u5370\u5730\u8BED" },
  hun: { lang: "hun", name: "\u5308\u7259\u5229\u8BED" },
  hu: { lang: "hun", name: "\u5308\u7259\u5229\u8BED" },
  ind: { lang: "ind", name: "\u5370\u5C3C\u8BED" },
  id: { lang: "ind", name: "\u5370\u5C3C\u8BED" },
  nor: { lang: "nor", name: "\u632A\u5A01\u8BED" },
  no: { lang: "nor", name: "\u632A\u5A01\u8BED" },
  nob: { lang: "nor", name: "\u632A\u5A01\u8BED" },
  pol: { lang: "pol", name: "\u6CE2\u5170\u8BED" },
  pl: { lang: "pol", name: "\u6CE2\u5170\u8BED" },
  rum: { lang: "rum", name: "\u7F57\u9A6C\u5C3C\u4E9A\u8BED" },
  ron: { lang: "rum", name: "\u7F57\u9A6C\u5C3C\u4E9A\u8BED" },
  ro: { lang: "rum", name: "\u7F57\u9A6C\u5C3C\u4E9A\u8BED" },
  swe: { lang: "swe", name: "\u745E\u5178\u8BED" },
  sv: { lang: "swe", name: "\u745E\u5178\u8BED" },
  tur: { lang: "tur", name: "\u571F\u8033\u5176\u8BED" },
  tr: { lang: "tur", name: "\u571F\u8033\u5176\u8BED" },
  ukr: { lang: "ukr", name: "\u4E4C\u514B\u5170\u8BED" },
  uk: { lang: "ukr", name: "\u4E4C\u514B\u5170\u8BED" },
  cze: { lang: "cze", name: "\u6377\u514B\u8BED" },
  ces: { lang: "cze", name: "\u6377\u514B\u8BED" },
  cs: { lang: "cze", name: "\u6377\u514B\u8BED" },
  slo: { lang: "slo", name: "\u65AF\u6D1B\u4F10\u514B\u8BED" },
  slk: { lang: "slo", name: "\u65AF\u6D1B\u4F10\u514B\u8BED" },
  sk: { lang: "slo", name: "\u65AF\u6D1B\u4F10\u514B\u8BED" },
  bul: { lang: "bul", name: "\u4FDD\u52A0\u5229\u4E9A\u8BED" },
  bg: { lang: "bul", name: "\u4FDD\u52A0\u5229\u4E9A\u8BED" },
  est: { lang: "est", name: "\u7231\u6C99\u5C3C\u4E9A\u8BED" },
  et: { lang: "est", name: "\u7231\u6C99\u5C3C\u4E9A\u8BED" }
};
function isGenericOrEmptySubtitleTitle(title) {
  if (!title) return true;
  const t = title.trim().toLowerCase();
  if (!t) return true;
  if (t === "no title" || t === "no title (subrip)" || t === "subrip" || t === "srt" || t === "ass" || t === "ssa" || t === "vtt" || t === "und" || t === "unknown" || t === "null" || t === "undefined" || t === "none" || t === "subtitle" || t === "subtitles") {
    return true;
  }
  if (/^no\s+title(\s*\([^)]*\))?$/i.test(t)) {
    return true;
  }
  return false;
}
function formatSubtitleTrackInfo(subtitleTitle, language, extension = "srt") {
  const rawLang = (language || "").trim().toLowerCase();
  const langEntry = SUBTITLE_LANG_MAP[rawLang];
  const canonicalLang = langEntry?.lang || (rawLang && rawLang !== "und" && rawLang !== "unknown" ? rawLang : "");
  const defaultLangName = langEntry?.name || (rawLang && rawLang !== "und" && rawLang !== "unknown" ? rawLang.toUpperCase() : "\u5B57\u5E55");
  let trackLabel = (subtitleTitle || "").trim();
  if (isGenericOrEmptySubtitleTitle(trackLabel)) {
    trackLabel = defaultLangName;
  }
  trackLabel = trackLabel.replace(new RegExp(`\\.${extension}$`, "i"), "").trim();
  const lowerLabel = trackLabel.toLowerCase();
  if (SUBTITLE_LANG_MAP[lowerLabel]) {
    trackLabel = SUBTITLE_LANG_MAP[lowerLabel].name;
  } else if (lowerLabel === "simplified") {
    trackLabel = "\u7B80\u4F53\u4E2D\u6587";
  } else if (lowerLabel === "traditional") {
    trackLabel = "\u7E41\u4F53\u4E2D\u6587";
  } else if (lowerLabel === "forced") {
    trackLabel = `${defaultLangName} (Forced)`;
  } else if (lowerLabel === "default") {
    trackLabel = `${defaultLangName} (Default)`;
  }
  if (!trackLabel.startsWith("[\u5916\u6302]")) {
    trackLabel = `[\u5916\u6302] ${trackLabel}`;
  }
  const safeBase = trackLabel.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").trim() || "[\u5916\u6302] \u5B57\u5E55";
  const fileName = `${safeBase}.${extension}`;
  return {
    title: trackLabel,
    lang: canonicalLang,
    fileName
  };
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
  async function fetchPlaybackInfo2(serverBase, itemId, apiKey, userId) {
    try {
      const userParam = userId ? `&UserId=${encodeURIComponent(userId)}` : "";
      const playbackUrl = `${serverBase}/Items/${itemId}/PlaybackInfo?api_key=${apiKey}${userParam}`;
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
  async function downloadExternalSubtitle2(serverBase, itemId, mediaSourceId, streamIndex, subtitlePath, apiKey, language, codec, deliveryUrl, subtitleTitle, selectTrack = true) {
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
      const { title: trackTitle, lang: trackLang, fileName } = formatSubtitleTrackInfo(
        subtitleTitle,
        language,
        extension
      );
      const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeStreamIndex = typeof streamIndex === "number" ? streamIndex : 0;
      const localPath = `@tmp/emby_${sanitizedItemId}_${safeStreamIndex}/${fileName}`;
      log(`Using filename: ${fileName}, localPath: ${localPath}`);
      log(`Downloading external subtitle: ${subtitleUrl} to ${localPath}`);
      log(`External subtitle path: ${subtitlePath}`);
      log(`Stream index: ${streamIndex}`);
      log(`Language: ${language} (normalized: ${trackLang})`);
      log(`Track title: "${trackTitle}"`);
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
      const flag = selectTrack ? "select" : "auto";
      try {
        const trackList = mpv2.getNative("track-list");
        if (Array.isArray(trackList)) {
          const existing = trackList.find(
            (t) => t.type === "sub" && (t["external-filename"] === resolvedPath || t.title && t.title === trackTitle)
          );
          if (existing && typeof existing.id === "number") {
            log(`Subtitle track already loaded in mpv (id=${existing.id}): ${resolvedPath}`);
            if (selectTrack) {
              mpv2.set("sid", existing.id);
              mpv2.set("sub-visibility", true);
              if (core2.subtitle) {
                core2.subtitle.id = existing.id;
              }
            }
            return true;
          }
        }
      } catch (checkErr) {
        log("Error checking existing track-list, proceeding to sub-add:", checkErr);
      }
      let loaded = false;
      try {
        log(`Loading external subtitle via mpv sub-add: ${resolvedPath}, flag: ${flag}, title: "${trackTitle}", lang: "${trackLang}"`);
        mpv2.command("sub-add", [resolvedPath, flag, trackTitle, trackLang]);
        loaded = true;
        log(`External subtitle loaded successfully via mpv sub-add: ${resolvedPath}`);
      } catch (mpvErr) {
        log(`mpv sub-add with title/lang failed, trying basic sub-add:`, mpvErr);
        try {
          mpv2.command("sub-add", [resolvedPath, flag]);
          loaded = true;
          log(`External subtitle loaded via basic mpv sub-add: ${resolvedPath}`);
        } catch (subErr) {
          log(`mpv sub-add failed, falling back to core.subtitle.loadTrack:`, subErr);
          try {
            core2.subtitle.loadTrack(resolvedPath);
            loaded = true;
            log(`External subtitle loaded via core.subtitle.loadTrack: ${resolvedPath}`);
          } catch (coreErr) {
            log.error(`All subtitle loading methods failed:`, coreErr);
            return false;
          }
        }
      }
      if (selectTrack) {
        try {
          const trackList = mpv2.getNative("track-list");
          if (Array.isArray(trackList)) {
            const subTracks = trackList.filter((t) => t.type === "sub");
            const matched = subTracks.find(
              (t) => t["external-filename"] === resolvedPath || t.title && t.title === trackTitle
            ) || subTracks[subTracks.length - 1];
            if (matched && typeof matched.id === "number") {
              log(`Activating subtitle track: id=${matched.id}, title="${matched.title || trackTitle}"`);
              mpv2.set("sid", matched.id);
              mpv2.set("sub-visibility", true);
              if (core2.subtitle) {
                core2.subtitle.id = matched.id;
              }
            }
          }
        } catch (selErr) {
          log("Selection verification error:", selErr);
        }
      }
      if (preferences2.get("show_notifications")) {
        const cleanName = trackTitle.replace(/^\[外挂\]\s*/, "");
        core2.osd(`\u5DF2\u52A0\u8F7D\u5916\u6302\u5B57\u5E55: ${cleanName}`);
      }
      return loaded;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error downloading external subtitle: ${errorMsg}`);
      return false;
    }
  }
  async function downloadAllSubtitles2(serverBase, itemId, apiKey, targetSubtitleIndex) {
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
          const isTarget = typeof targetSubtitleIndex === "number" && targetSubtitleIndex === stream.Index;
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
            streamTitle || null,
            isTarget
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
      const clean = message.subtitleTitle.trim();
      currentPlaybackSubtitleTitle = isGenericOrEmptySubtitleTitle(clean) ? null : clean;
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
            playSessionId,
            audioStreamIndex: currentPlaybackSession?.currentAudioStreamIndex,
            subtitleStreamIndex: currentPlaybackSession?.currentSubtitleStreamIndex
          });
        }
        return true;
      }
      const postData = {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        CanSeek: true,
        PlayMethod: "DirectPlay",
        PositionTicks: positionTicks
      };
      if (typeof currentPlaybackSession?.currentAudioStreamIndex === "number" && currentPlaybackSession.currentAudioStreamIndex >= 0) {
        postData.AudioStreamIndex = currentPlaybackSession.currentAudioStreamIndex;
      }
      if (typeof currentPlaybackSession?.currentSubtitleStreamIndex === "number") {
        postData.SubtitleStreamIndex = currentPlaybackSession.currentSubtitleStreamIndex;
      }
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: postData
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
            playSessionId,
            audioStreamIndex: currentPlaybackSession?.currentAudioStreamIndex,
            subtitleStreamIndex: currentPlaybackSession?.currentSubtitleStreamIndex
          });
        }
        return true;
      }
      const url = `${serverBase}/Sessions/Playing/Progress?api_key=${apiKey}`;
      const postData = {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        PositionTicks: positionTicks,
        IsPaused: isPaused,
        CanSeek: true,
        PlayMethod: "DirectPlay"
      };
      if (typeof currentPlaybackSession?.currentAudioStreamIndex === "number" && currentPlaybackSession.currentAudioStreamIndex >= 0) {
        postData.AudioStreamIndex = currentPlaybackSession.currentAudioStreamIndex;
      }
      if (typeof currentPlaybackSession?.currentSubtitleStreamIndex === "number") {
        postData.SubtitleStreamIndex = currentPlaybackSession.currentSubtitleStreamIndex;
      }
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: postData
      });
      if (response.statusCode >= 400) {
        log(`Progress report failed with status: ${response.statusCode}`);
        return false;
      }
      if (typeof onProgressUpdated === "function") {
        onProgressUpdated({
          itemId,
          positionTicks,
          isPaused,
          audioStreamIndex: currentPlaybackSession?.currentAudioStreamIndex,
          subtitleStreamIndex: currentPlaybackSession?.currentSubtitleStreamIndex
        });
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
            playSessionId,
            audioStreamIndex: currentPlaybackSession?.currentAudioStreamIndex,
            subtitleStreamIndex: currentPlaybackSession?.currentSubtitleStreamIndex
          });
        }
        return true;
      }
      const url = `${serverBase}/Sessions/Playing/Stopped?api_key=${apiKey}`;
      log(`Reporting playback stop: position=${positionSeconds}s (${positionTicks} ticks)`);
      const postData = {
        ItemId: itemId,
        MediaSourceId: mediaSourceId || itemId,
        PlaySessionId: playSessionId,
        PositionTicks: positionTicks
      };
      if (typeof currentPlaybackSession?.currentAudioStreamIndex === "number" && currentPlaybackSession.currentAudioStreamIndex >= 0) {
        postData.AudioStreamIndex = currentPlaybackSession.currentAudioStreamIndex;
      }
      if (typeof currentPlaybackSession?.currentSubtitleStreamIndex === "number") {
        postData.SubtitleStreamIndex = currentPlaybackSession.currentSubtitleStreamIndex;
      }
      const response = await http2.post(url, {
        headers: buildEmbyHeaders3(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json"
        }),
        data: postData
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
  async function startPlaybackTracking2(serverBase, itemId, apiKey, userId, knownStartPositionSeconds, isBrowserPlayback, initialAudioIndex, initialSubtitleIndex) {
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
        const playbackInfo = await fetchPlaybackInfo2(serverBase, itemId, apiKey, userId);
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
      isBrowserPlayback: Boolean(isBrowserPlayback),
      currentAudioStreamIndex: initialAudioIndex ?? null,
      currentSubtitleStreamIndex: initialSubtitleIndex ?? null
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
  function updateActiveTracks2(audioIndex, subIndex) {
    if (!currentPlaybackSession) return;
    const prevAudio = currentPlaybackSession.currentAudioStreamIndex;
    const prevSub = currentPlaybackSession.currentSubtitleStreamIndex;
    currentPlaybackSession.currentAudioStreamIndex = audioIndex;
    currentPlaybackSession.currentSubtitleStreamIndex = subIndex;
    const changed = prevAudio !== audioIndex || prevSub !== subIndex;
    if (changed && hasStartedPlayback) {
      log(`[tracks] Active tracks updated: audio=${audioIndex ?? "none"}, sub=${subIndex ?? "none"}`);
      const pos = samplePosition();
      if (typeof pos === "number") {
        reportPlaybackProgress(
          currentPlaybackSession.serverBase,
          currentPlaybackSession.itemId,
          currentPlaybackSession.apiKey,
          pos,
          currentPlaybackSession.playSessionId,
          currentPlaybackSession.mediaSourceId,
          core2.status.paused || false
        );
      }
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
    getCurrentPlaybackSession: getCurrentPlaybackSession2,
    updateActiveTracks: updateActiveTracks2
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
  chs: "zh",
  cht: "zh",
  sc: "zh",
  tc: "zh",
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
    if (typeof streamIndex === "number" && Array.isArray(criteria.embyStreams) && criteria.embyStreams.length > 0) {
      const candidateSubs = criteria.embyStreams.filter((s) => s.Type?.toLowerCase() === "subtitle" && !s.IsExternal);
      const targetSubIdx = candidateSubs.findIndex((s) => s.Index === streamIndex);
      if (targetSubIdx !== -1 && targetSubIdx === i) {
        score += 200;
      }
    }
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
      const cleanTargetTitle = title.replace(/^\[外挂\]\s*/, "").trim().toLowerCase();
      const cleanTrackTitle = track.title.replace(/^\[外挂\]\s*/, "").trim().toLowerCase();
      if (!cleanTrackTitle.includes("no title") && !cleanTargetTitle.includes("no title")) {
        if (cleanTrackTitle === cleanTargetTitle) {
          score += 40;
        } else if (cleanTargetTitle.includes(cleanTrackTitle) || cleanTrackTitle.includes(cleanTargetTitle)) {
          score += 25;
        }
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
    if (typeof streamIndex === "number" && Array.isArray(criteria.embyStreams) && criteria.embyStreams.length > 0) {
      const candidateAudio = criteria.embyStreams.filter((s) => s.Type?.toLowerCase() === "audio");
      const targetAudioIdx = candidateAudio.findIndex((s) => s.Index === streamIndex);
      if (targetAudioIdx !== -1 && targetAudioIdx === i) {
        score += 200;
      }
    }
    if (typeof trackNumber === "number" && trackNumber > 0 && i === trackNumber - 1) {
      score += 100;
    }
    if (typeof streamIndex === "number" && typeof track["ff-index"] === "number" && track["ff-index"] === streamIndex) {
      score += 90;
    }
    if (targetCanonLang && trackCanonLang && targetCanonLang === trackCanonLang) {
      score += 50;
    }
    if (typeof criteria.channels === "number" && criteria.channels > 0) {
      const trackChannels = typeof track["channel-count"] === "number" ? track["channel-count"] : typeof track.channels === "number" ? track.channels : typeof track["audio-channels"] === "number" ? track["audio-channels"] : 0;
      if (trackChannels === criteria.channels) {
        score += 30;
      }
    }
    if (criteria.channelLayout) {
      const layout = criteria.channelLayout.toLowerCase();
      const trackTitle = (track.title || "").toLowerCase();
      if (layout === "surround" && (trackTitle.includes("5.1") || trackTitle.includes("7.1") || trackTitle.includes("atmos"))) {
        score += 30;
      } else if (layout === "stereo" && (trackTitle.includes("stereo") || trackTitle.includes("2.0"))) {
        score += 30;
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
function parsePreferredList(pref) {
  if (!pref) return [];
  if (Array.isArray(pref)) return pref.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return pref.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
}
function findBestAudioTrackByPreference(audioTracks, preferredLanguages, preferredChannel) {
  if (!Array.isArray(audioTracks) || audioTracks.length === 0) {
    return void 0;
  }
  const prefLangs = parsePreferredList(preferredLanguages);
  const channelPref = (preferredChannel || "auto").trim().toLowerCase();
  let bestMatch;
  let highestScore = -1;
  for (const track of audioTracks) {
    let score = 0;
    const trackCanon = canonicalizeLanguage(track.lang);
    const trackTitle = (track.title || "").toLowerCase();
    const channelCount = typeof track["channel-count"] === "number" ? track["channel-count"] : typeof track.channels === "number" ? track.channels : typeof track["audio-channels"] === "number" ? track["audio-channels"] : trackTitle.includes("7.1") ? 8 : trackTitle.includes("5.1") ? 6 : trackTitle.includes("stereo") || trackTitle.includes("2.0") ? 2 : 0;
    if (prefLangs.length > 0) {
      for (let i = 0; i < prefLangs.length; i++) {
        const pref = prefLangs[i];
        const prefCanon = canonicalizeLanguage(pref);
        if (prefCanon && trackCanon && prefCanon === trackCanon) {
          score += 1e3 - i * 50;
          break;
        }
      }
    } else {
      score += 100;
    }
    if (channelPref === "surround") {
      if (channelCount >= 6 || trackTitle.includes("5.1") || trackTitle.includes("7.1") || trackTitle.includes("atmos")) {
        score += 60;
      }
    } else if (channelPref === "stereo") {
      if (channelCount === 2 || trackTitle.includes("stereo") || trackTitle.includes("2.0")) {
        score += 60;
      }
    } else {
      if (channelCount > 0) {
        score += Math.min(channelCount * 5, 40);
      }
    }
    if (track.default) {
      score += 10;
    }
    if (score > highestScore) {
      highestScore = score;
      bestMatch = track;
    }
  }
  return highestScore > 0 ? bestMatch : audioTracks[0];
}
function findBestSubtitleTrackByPreference(subTracks, preferredLanguages) {
  if (!Array.isArray(subTracks) || subTracks.length === 0) {
    return void 0;
  }
  const prefLangs = parsePreferredList(preferredLanguages);
  if (prefLangs.length === 0) {
    return void 0;
  }
  let bestMatch;
  let highestScore = -1;
  for (const track of subTracks) {
    let score = 0;
    const trackCanon = canonicalizeLanguage(track.lang);
    const trackVariant = detectChineseVariant((track.title || "") + " " + (track.lang || ""));
    for (let i = 0; i < prefLangs.length; i++) {
      const pref = prefLangs[i];
      const prefCanon = canonicalizeLanguage(pref);
      const prefVariant = detectChineseVariant(pref);
      if (prefCanon && trackCanon && prefCanon === trackCanon) {
        let matchScore = 1e3 - i * 50;
        if (prefCanon === "zh") {
          if (prefVariant !== "unknown" && trackVariant !== "unknown") {
            if (prefVariant === trackVariant) {
              matchScore += 80;
            } else {
              matchScore -= 100;
            }
          }
        }
        score = Math.max(score, matchScore);
      }
    }
    if (score > 0) {
      if (!track.forced) {
        score += 20;
      }
      if (track.default) {
        score += 10;
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = track;
      }
    }
  }
  return highestScore > 0 ? bestMatch : void 0;
}
function findEmbyStreamIndexForMpvTrack(mpvTrack, embyStreams, streamType) {
  if (!mpvTrack) return null;
  const ffIndex = typeof mpvTrack["ff-index"] === "number" ? mpvTrack["ff-index"] : null;
  const srcId = typeof mpvTrack["src-id"] === "number" ? mpvTrack["src-id"] : null;
  if (Array.isArray(embyStreams) && embyStreams.length > 0) {
    const candidateStreams = streamType ? embyStreams.filter((s) => s.Type?.toLowerCase() === streamType.toLowerCase()) : embyStreams;
    if (ffIndex !== null) {
      const found = candidateStreams.find((s) => s.Index === ffIndex);
      if (found) return found.Index;
    }
    if (srcId !== null) {
      const found = candidateStreams.find((s) => s.Index === srcId);
      if (found) return found.Index;
    }
    if (typeof mpvTrack.id === "number" && mpvTrack.id > 0) {
      const embeddedCandidates = candidateStreams.filter((s) => !s.IsExternal);
      if (mpvTrack.id <= embeddedCandidates.length) {
        const candidate = embeddedCandidates[mpvTrack.id - 1];
        const trackCanon2 = canonicalizeLanguage(mpvTrack.lang);
        const candCanon = canonicalizeLanguage(candidate.Language);
        if (!trackCanon2 || !candCanon || trackCanon2 === candCanon) {
          return candidate.Index;
        }
      }
    }
    const trackCanon = canonicalizeLanguage(mpvTrack.lang);
    const trackTitle = (mpvTrack.title || "").trim().toLowerCase();
    for (const s of candidateStreams) {
      const streamCanon = canonicalizeLanguage(s.Language);
      const streamTitle = (s.DisplayTitle || s.Title || "").trim().toLowerCase();
      if (trackCanon && streamCanon && trackCanon === streamCanon) {
        if (trackTitle && streamTitle && (trackTitle.includes(streamTitle) || streamTitle.includes(trackTitle))) {
          return s.Index;
        }
      }
    }
    if (typeof mpvTrack.id === "number" && mpvTrack.id > 0) {
      const embeddedCandidates = candidateStreams.filter((s) => !s.IsExternal);
      if (mpvTrack.id <= embeddedCandidates.length) {
        return embeddedCandidates[mpvTrack.id - 1].Index;
      }
    }
    if (trackCanon) {
      const foundLang = candidateStreams.find((s) => canonicalizeLanguage(s.Language) === trackCanon);
      if (foundLang) return foundLang.Index;
    }
  }
  return ffIndex !== null ? ffIndex : srcId !== null ? srcId : typeof mpvTrack.id === "number" ? mpvTrack.id : null;
}

// plugin/src/lib/track-preference-store.ts
var PREF_ITEM_TRACKS_KEY = "emby_track_preferences";
var PREF_SERIES_TRACKS_KEY = "emby_series_track_preferences";
var MAX_ITEM_ENTRIES = 200;
var MAX_SERIES_ENTRIES = 100;
function safeParseJson(raw, defaultValue) {
  if (typeof raw !== "string" || !raw.trim()) {
    if (raw && typeof raw === "object") return raw;
    return defaultValue;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return defaultValue;
  }
}
function saveTrackSelection(preferences2, itemId, selection, seriesId) {
  if (!preferences2 || !itemId) return;
  const rawMap = preferences2.get(PREF_ITEM_TRACKS_KEY);
  const itemMap = safeParseJson(rawMap, {});
  const now = Date.now();
  itemMap[itemId] = {
    ...selection,
    itemId,
    seriesId: seriesId || selection.seriesId,
    updatedAt: now
  };
  const itemKeys = Object.keys(itemMap);
  if (itemKeys.length > MAX_ITEM_ENTRIES) {
    const sortedKeys = itemKeys.sort((a, b) => (itemMap[a]?.updatedAt || 0) - (itemMap[b]?.updatedAt || 0));
    const toRemove = sortedKeys.slice(0, itemKeys.length - MAX_ITEM_ENTRIES);
    for (const key of toRemove) {
      delete itemMap[key];
    }
  }
  preferences2.set(PREF_ITEM_TRACKS_KEY, JSON.stringify(itemMap));
  const effectiveSeriesId = seriesId || selection.seriesId;
  if (effectiveSeriesId && (selection.audioLanguage || selection.subtitleLanguage || selection.subtitleStreamIndex === -1 || selection.audioChannels || selection.channelLayout)) {
    const rawSeriesMap = preferences2.get(PREF_SERIES_TRACKS_KEY);
    const seriesMap = safeParseJson(rawSeriesMap, {});
    seriesMap[effectiveSeriesId] = {
      seriesId: effectiveSeriesId,
      audioLanguage: selection.audioLanguage ?? seriesMap[effectiveSeriesId]?.audioLanguage ?? null,
      audioChannels: selection.audioChannels ?? seriesMap[effectiveSeriesId]?.audioChannels ?? null,
      channelLayout: selection.channelLayout ?? seriesMap[effectiveSeriesId]?.channelLayout ?? null,
      subtitleLanguage: selection.subtitleStreamIndex === -1 ? "off" : selection.subtitleLanguage ?? seriesMap[effectiveSeriesId]?.subtitleLanguage ?? null,
      updatedAt: now
    };
    const seriesKeys = Object.keys(seriesMap);
    if (seriesKeys.length > MAX_SERIES_ENTRIES) {
      const sortedSeriesKeys = seriesKeys.sort(
        (a, b) => (seriesMap[a]?.updatedAt || 0) - (seriesMap[b]?.updatedAt || 0)
      );
      const toRemoveSeries = sortedSeriesKeys.slice(0, seriesKeys.length - MAX_SERIES_ENTRIES);
      for (const k of toRemoveSeries) {
        delete seriesMap[k];
      }
    }
    preferences2.set(PREF_SERIES_TRACKS_KEY, JSON.stringify(seriesMap));
  }
  if (typeof preferences2.sync === "function") {
    preferences2.sync();
  }
}
function getSavedTrackSelection(preferences2, itemId, seriesId) {
  if (!preferences2 || !itemId) return null;
  const rawMap = preferences2.get(PREF_ITEM_TRACKS_KEY);
  const itemMap = safeParseJson(rawMap, {});
  const saved = itemMap[itemId];
  if (saved) {
    return saved;
  }
  if (seriesId) {
    const rawSeriesMap = preferences2.get(PREF_SERIES_TRACKS_KEY);
    const seriesMap = safeParseJson(rawSeriesMap, {});
    const seriesPref = seriesMap[seriesId];
    if (seriesPref) {
      return {
        itemId,
        seriesId,
        audioStreamIndex: null,
        audioLanguage: seriesPref.audioLanguage ?? null,
        audioChannels: seriesPref.audioChannels ?? null,
        channelLayout: seriesPref.channelLayout ?? null,
        subtitleLanguage: seriesPref.subtitleLanguage === "off" ? null : seriesPref.subtitleLanguage ?? null,
        subtitleStreamIndex: seriesPref.subtitleLanguage === "off" ? -1 : null,
        updatedAt: seriesPref.updatedAt
      };
    }
  }
  return null;
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
var {
  startPlaybackTracking,
  stopPlaybackTracking,
  handlePauseChange,
  getCurrentPlaybackSession,
  updateActiveTracks
} = createPlaybackTrackingManager({
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
var currentEmbyStreams = [];
var currentItemMetadata = null;
var currentActiveItemId = null;
var currentActiveSeriesId = null;
var currentActiveAudioStreamIndex = null;
var currentActiveSubtitleStreamIndex = null;
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
      let reportUserId;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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
var ENFORCEMENT_DURATION_MS = 1500;
var MAX_ENFORCEMENT_REAPPLIES = 2;
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
function snapshotCurrentTracksAndSave(source) {
  if (isWindowClosing || !currentActiveItemId) return;
  if (preferences.get("remember_track_selections") === false) return;
  try {
    const trackList = mpv.getNative("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) return;
    const currentAid = mpv.getString("aid");
    const activeAudio = trackList.find(
      (t) => t.type === "audio" && (String(t.id) === currentAid || Boolean(t.selected))
    );
    const audioStreamIndex = activeAudio ? findEmbyStreamIndexForMpvTrack(activeAudio, currentEmbyStreams, "Audio") : null;
    const audioChannels = activeAudio && typeof activeAudio["channel-count"] === "number" ? activeAudio["channel-count"] : activeAudio && typeof activeAudio.channels === "number" ? activeAudio.channels : null;
    const channelLayout = activeAudio && typeof activeAudio["demux-channels"] === "string" ? activeAudio["demux-channels"] : audioChannels === 6 ? "5.1" : audioChannels === 8 ? "7.1" : audioChannels === 2 ? "stereo" : null;
    const currentSid = mpv.getString("sid");
    let subVisibility = true;
    try {
      subVisibility = mpv.getFlag("sub-visibility");
    } catch {
      const visStr = mpv.getString("sub-visibility");
      subVisibility = visStr !== "no" && visStr !== "false";
    }
    const isSubOff = subVisibility === false || currentSid === "no" || currentSid === "0" || currentSid === "false" || !currentSid;
    let subStreamIndex = -1;
    let activeSub;
    if (!isSubOff) {
      activeSub = trackList.find(
        (t) => t.type === "sub" && (String(t.id) === currentSid || Boolean(t.selected))
      );
      if (activeSub) {
        subStreamIndex = findEmbyStreamIndexForMpvTrack(activeSub, currentEmbyStreams, "Subtitle");
      }
    }
    debugLog(
      `[SaveTracks] (${source}) itemId=${currentActiveItemId}, audioStreamIndex=${audioStreamIndex} (aid=${currentAid}), subStreamIndex=${subStreamIndex} (sid=${currentSid}, vis=${subVisibility})`
    );
    saveTrackSelection(
      preferences,
      currentActiveItemId,
      {
        audioStreamIndex,
        subtitleStreamIndex: subStreamIndex,
        audioLanguage: activeAudio?.lang || null,
        audioTitle: activeAudio?.title || null,
        audioChannels,
        channelLayout,
        subtitleLanguage: isSubOff ? "off" : activeSub?.lang || null,
        subtitleTitle: isSubOff ? null : activeSub?.title || null
      },
      currentActiveSeriesId || void 0
    );
    currentActiveAudioStreamIndex = audioStreamIndex;
    currentActiveSubtitleStreamIndex = subStreamIndex;
    updateActiveTracks(audioStreamIndex, subStreamIndex);
  } catch (err) {
    debugLog("[SaveTracks] Error capturing tracks:", err);
  }
}
async function applySelectedAudioTrack(serverBase, itemId, apiKey, userId) {
  try {
    const trackList = mpv.getNative("track-list");
    if (!Array.isArray(trackList) || trackList.length === 0) {
      return;
    }
    const audioTracks = trackList.filter((t) => t.type === "audio");
    if (audioTracks.length === 0) {
      debugLog("No audio tracks found in mpv track-list");
      return;
    }
    let targetAudio = getPendingAudioIndex(itemId);
    let targetAudioTrackNum = getPendingAudioTrackNumber(itemId);
    let targetAudioLang = getPendingAudioLanguage(itemId);
    let targetAudioChannels;
    let targetChannelLayout;
    if (typeof targetAudio !== "number" && typeof targetAudioTrackNum !== "number" && !targetAudioLang) {
      if (preferences.get("remember_track_selections") !== false) {
        const saved = getSavedTrackSelection(preferences, itemId, currentActiveSeriesId || void 0);
        if (saved) {
          if (typeof saved.audioStreamIndex === "number") {
            targetAudio = saved.audioStreamIndex;
          }
          if (saved.audioLanguage) {
            targetAudioLang = saved.audioLanguage;
          }
          if (typeof saved.audioChannels === "number") {
            targetAudioChannels = saved.audioChannels;
          }
          if (saved.channelLayout) {
            targetChannelLayout = saved.channelLayout;
          }
          debugLog(
            `[Audio] Using remembered selection for ${itemId}: streamIndex=${targetAudio}, lang=${targetAudioLang}, channels=${targetAudioChannels}, layout=${targetChannelLayout}`
          );
        }
      }
    }
    if (typeof targetAudio !== "number" && typeof targetAudioTrackNum !== "number" && !targetAudioLang) {
      try {
        if (currentEmbyStreams.length === 0) {
          const pb = await fetchPlaybackInfo(serverBase, itemId, apiKey, userId);
          if (pb?.MediaSources?.[0]?.MediaStreams) {
            currentEmbyStreams = pb.MediaSources[0].MediaStreams;
          }
          if (typeof pb?.MediaSources?.[0]?.DefaultAudioStreamIndex === "number") {
            targetAudio = pb.MediaSources[0].DefaultAudioStreamIndex;
            debugLog(`[Audio] Using Emby server DefaultAudioStreamIndex: ${targetAudio}`);
          }
        }
      } catch (e) {
        debugLog("Failed to fetch PlaybackInfo for default audio:", e);
      }
    }
    let match;
    if (typeof targetAudio === "number" || typeof targetAudioTrackNum === "number" || targetAudioLang) {
      match = findMatchingAudioTrack(audioTracks, {
        trackNumber: targetAudioTrackNum,
        streamIndex: targetAudio,
        language: targetAudioLang,
        channels: targetAudioChannels,
        channelLayout: targetChannelLayout,
        embyStreams: currentEmbyStreams
      });
    }
    if (!match) {
      const preferredAudioLang = preferences.get("preferred_audio_language") || "zh,chi,ja,jpn,en,eng";
      const preferredChannel = preferences.get("preferred_audio_channel") || "auto";
      match = findBestAudioTrackByPreference(audioTracks, preferredAudioLang, preferredChannel);
      if (match) {
        debugLog(`[Audio] Using global preference match: trackId=${match.id}, lang=${match.lang}, title=${match.title}`);
      }
    }
    const targetAid = match && typeof match.id === "number" ? match.id : null;
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
      const embyAudioIdx = findEmbyStreamIndexForMpvTrack(match, currentEmbyStreams, "Audio");
      currentActiveAudioStreamIndex = embyAudioIdx;
      updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
      snapshotCurrentTracksAndSave("apply-selected-audio");
    }
  } catch (err) {
    debugLog("Failed to set audio track:", err);
  }
}
var isDownloadingExternalSubtitle = false;
async function applySelectedSubtitleTrack(serverBase, itemId, apiKey, userId) {
  let pendingSubtitle = getPendingSubtitleIndex(itemId);
  let pendingSubTrackNum = getPendingSubtitleTrackNumber(itemId);
  let pendingSubLang = getPendingSubtitleLanguage(itemId);
  let isExternal = getPendingIsExternalSubtitle(itemId);
  let subCodec = getPendingSubtitleCodec(itemId);
  let subPath = getPendingSubtitlePath(itemId);
  let mediaSourceId = getPendingMediaSourceId(itemId);
  let deliveryUrl = getPendingSubtitleDeliveryUrl(itemId);
  let subtitleTitle = getPendingSubtitleTitle(itemId);
  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number" && !pendingSubLang) {
    if (preferences.get("remember_track_selections") !== false) {
      const saved = getSavedTrackSelection(preferences, itemId, currentActiveSeriesId || void 0);
      if (saved) {
        if (saved.subtitleStreamIndex === -1 || saved.subtitleLanguage === "off") {
          pendingSubtitle = -1;
        } else if (typeof saved.subtitleStreamIndex === "number") {
          pendingSubtitle = saved.subtitleStreamIndex;
        }
        if (saved.subtitleLanguage && saved.subtitleLanguage !== "off") {
          pendingSubLang = saved.subtitleLanguage;
        }
        debugLog(`[Subtitle] Using remembered selection for ${itemId}: streamIndex=${pendingSubtitle}, lang=${pendingSubLang}`);
      }
    }
  }
  if (typeof pendingSubtitle !== "number" && typeof pendingSubTrackNum !== "number" && !pendingSubLang) {
    try {
      if (currentEmbyStreams.length === 0) {
        const pb = await fetchPlaybackInfo(serverBase, itemId, apiKey, userId);
        if (pb?.MediaSources?.[0]?.MediaStreams) {
          currentEmbyStreams = pb.MediaSources[0].MediaStreams;
        }
        if (typeof pb?.MediaSources?.[0]?.DefaultSubtitleStreamIndex === "number") {
          pendingSubtitle = pb.MediaSources[0].DefaultSubtitleStreamIndex;
          debugLog(`[Subtitle] Using Emby server DefaultSubtitleStreamIndex: ${pendingSubtitle}`);
        }
      }
    } catch (e) {
      debugLog("Failed to fetch PlaybackInfo for default subtitle:", e);
    }
  }
  if (pendingSubtitle === -1) {
    debugLog("Subtitles turned off by user or remembered preference");
    try {
      const currentSid = mpv.getString("sid");
      if (currentSid !== "no" && currentSid !== "0") {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      }
    } catch {
    }
    startEnforcingTracks(itemId, "no", null);
    currentActiveSubtitleStreamIndex = -1;
    updateActiveTracks(currentActiveAudioStreamIndex, -1);
    snapshotCurrentTracksAndSave("apply-sub-off");
    return;
  }
  if (typeof pendingSubtitle === "number" && currentEmbyStreams.length > 0) {
    const matchedStream = currentEmbyStreams.find((s) => s.Index === pendingSubtitle && s.Type === "Subtitle");
    if (matchedStream) {
      if (matchedStream.IsExternal) {
        isExternal = true;
        subCodec = matchedStream.Codec || subCodec;
        subPath = matchedStream.Path || subPath;
        deliveryUrl = matchedStream.DeliveryUrl || deliveryUrl;
        subtitleTitle = matchedStream.DisplayTitle || matchedStream.Title || subtitleTitle;
        pendingSubLang = matchedStream.Language || pendingSubLang;
      }
    }
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
        currentActiveSubtitleStreamIndex = pendingSubtitle;
        updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
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
    let match;
    if (typeof pendingSubtitle === "number" || typeof pendingSubTrackNum === "number" || pendingSubLang) {
      match = findMatchingSubtitleTrack(subTracks, {
        trackNumber: pendingSubTrackNum,
        streamIndex: pendingSubtitle,
        language: pendingSubLang,
        title: subtitleTitle,
        codec: subCodec,
        embyStreams: currentEmbyStreams
      });
    }
    if (!match && preferences.get("auto_select_subtitles") !== false) {
      const preferredSubLang = preferences.get("preferred_subtitle_language") || "zh,chi,chs,sc,cht,tc,en";
      match = findBestSubtitleTrackByPreference(subTracks, preferredSubLang);
      if (match) {
        debugLog(`[Subtitle] Using global preference match: trackId=${match.id}, lang=${match.lang}, title=${match.title}`);
      }
    }
    const targetSid = match && typeof match.id === "number" ? match.id : null;
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
      if (preferences.get("show_notifications")) {
        const cleanTitle = subtitleTitle && !isGenericOrEmptySubtitleTitle(subtitleTitle) ? subtitleTitle : pendingSubLang ? `${pendingSubLang.toUpperCase()} \u5B57\u5E55` : "\u5B57\u5E55";
        core.osd(`\u5B57\u5E55: ${cleanTitle}`);
      }
      const embySubIdx = findEmbyStreamIndexForMpvTrack(match, currentEmbyStreams, "Subtitle");
      currentActiveSubtitleStreamIndex = embySubIdx;
      updateActiveTracks(currentActiveAudioStreamIndex, currentActiveSubtitleStreamIndex);
      snapshotCurrentTracksAndSave("apply-selected-sub");
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
      let reportUserId;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo2.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo2.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo2.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo2.itemId, reportApiKey, reportUserId);
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
    currentActiveItemId = embyInfo.itemId;
    currentActiveSeriesId = null;
    currentEmbyStreams = [];
    currentActiveAudioStreamIndex = getPendingAudioIndex(embyInfo.itemId);
    currentActiveSubtitleStreamIndex = getPendingSubtitleIndex(embyInfo.itemId);
    fetchPlaybackInfo(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId).then((pb) => {
      if (pb?.MediaSources?.[0]?.MediaStreams) {
        currentEmbyStreams = pb.MediaSources[0].MediaStreams;
      }
    }).catch((e) => {
      debugLog("Error pre-fetching PlaybackInfo streams:", e);
    });
    fetchItemMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId).then((meta) => {
      currentItemMetadata = meta;
      if (meta?.SeriesId) {
        currentActiveSeriesId = meta.SeriesId;
      }
    }).catch((e) => {
      debugLog("Error pre-fetching item metadata:", e);
    });
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
      startPlaybackTracking(
        reportServerBase,
        embyInfo.itemId,
        reportApiKey,
        reportUserId,
        pendingStart,
        isBrowser,
        currentActiveAudioStreamIndex,
        currentActiveSubtitleStreamIndex
      );
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
    const applyTracksNow = async () => {
      try {
        if (currentEmbyStreams.length === 0) {
          const pb = await fetchPlaybackInfo(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
          if (pb?.MediaSources?.[0]?.MediaStreams) {
            currentEmbyStreams = pb.MediaSources[0].MediaStreams;
          }
        }
      } catch (e) {
        debugLog("Error pre-fetching PlaybackInfo streams:", e);
      }
      try {
        if (!currentActiveSeriesId) {
          const meta = await fetchItemMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
          if (meta?.SeriesId) {
            currentActiveSeriesId = meta.SeriesId;
          }
        }
      } catch (e) {
        debugLog("Error pre-fetching item metadata:", e);
      }
      await applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      await applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    };
    applyTracksNow();
    setTimeout(applyTracksNow, 250);
    setTimeout(applyTracksNow, 750);
    setTimeout(applyTracksNow, 1500);
    const pendingSubtitle = getPendingSubtitleIndex(embyInfo.itemId);
    if (!isBrowser && pendingSubtitle !== -1 && preferences.get("auto_download_enabled")) {
      debugLog(`Auto-downloading subtitles for: ${embyInfo.itemId}`);
      const hasSpecificSubSelected = typeof pendingSubtitle === "number";
      downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey, pendingSubtitle).then(() => {
        if (hasSpecificSubSelected) {
          applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
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
  snapshotCurrentTracksAndSave(`termination-${reason}`);
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
      let reportUserId;
      const session = getStoredEmbySession();
      if (preferences.get("use_connected_account") && session?.accessToken && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportServerBase = session.serverUrl;
        reportApiKey = session.accessToken;
        reportUserId = session.userId;
      } else if (session?.userId && isSameEmbyHost(session.serverUrl, embyInfo.serverBase)) {
        reportUserId = session.userId;
      }
      applySelectedAudioTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
      applySelectedSubtitleTrack(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
    }
  }
};
event.on("mpv.track-list.changed", handleTracksChanged);
event.on("mpv.tracks-changed", handleTracksChanged);
event.on("mpv.sid.changed", (newSidVal) => {
  if (isWindowClosing || !currentActiveItemId) return;
  const currentSidStr = String(newSidVal ?? "");
  if (targetSidToEnforce !== null) {
    const targetStr = String(targetSidToEnforce);
    if (currentSidStr === targetStr) {
      debugLog(`Enforcement satisfied: mpv sid reached target ${targetStr}`);
      targetSidToEnforce = null;
      snapshotCurrentTracksAndSave("enforce-satisfied-sid");
      return;
    }
    const elapsed = Date.now() - enforcementStartTime;
    if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
      debugLog(`Enforcement window ended for sid (elapsed=${elapsed}ms). User switched to sid=${currentSidStr}`);
      targetSidToEnforce = null;
      snapshotCurrentTracksAndSave("user-switch-sid");
      return;
    }
    enforcementReapplyCount++;
    debugLog(`Enforcement: Re-applying target sid=${targetStr} (mpv set to ${newSidVal})`);
    try {
      if (targetSidToEnforce === "no") {
        mpv.set("sid", "no");
        mpv.set("sub-visibility", false);
      } else {
        mpv.set("sid", targetStr);
        mpv.set("sub-visibility", true);
      }
    } catch {
    }
    return;
  }
  debugLog(`[User Action] Subtitle track changed to sid=${currentSidStr}`);
  snapshotCurrentTracksAndSave("user-switched-sid");
});
event.on("mpv.sub-visibility.changed", (vis) => {
  if (isWindowClosing || !currentActiveItemId) return;
  debugLog(`[User Action] Subtitle visibility changed to ${vis}`);
  snapshotCurrentTracksAndSave("sub-visibility-changed");
});
event.on("mpv.aid.changed", (newAidVal) => {
  if (isWindowClosing || !currentActiveItemId) return;
  const currentAidStr = String(newAidVal ?? "");
  if (targetAidToEnforce !== null) {
    const targetStr = String(targetAidToEnforce);
    if (currentAidStr === targetStr) {
      debugLog(`Enforcement satisfied: mpv aid reached target ${targetStr}`);
      targetAidToEnforce = null;
      snapshotCurrentTracksAndSave("enforce-satisfied-aid");
      return;
    }
    const elapsed = Date.now() - enforcementStartTime;
    if (elapsed > ENFORCEMENT_DURATION_MS || enforcementReapplyCount >= MAX_ENFORCEMENT_REAPPLIES) {
      debugLog(`Enforcement window ended for aid (elapsed=${elapsed}ms). User switched to aid=${currentAidStr}`);
      targetAidToEnforce = null;
      snapshotCurrentTracksAndSave("user-switch-aid");
      return;
    }
    enforcementReapplyCount++;
    debugLog(`Enforcement: Re-applying target aid=${targetStr} (mpv set to ${newAidVal})`);
    try {
      mpv.set("aid", targetStr);
    } catch {
    }
    return;
  }
  debugLog(`[User Action] Audio track changed to aid=${currentAidStr}`);
  snapshotCurrentTracksAndSave("user-switched-aid");
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
  snapshotCurrentTracksAndSave("pause-changed");
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
