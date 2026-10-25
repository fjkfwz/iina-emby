import { type EmbyItemMetadata, type EmbyItemsResponse, type EmbySeasonItem, formatFullEpisodeTitle } from "@shared";
import type { DebugLogger } from "./debug-log";
import type { SafeHttp } from "./safe-http";

export interface AutoplayManagerDeps {
  http: typeof iina.http | SafeHttp;
  mpv: typeof iina.mpv;
  core: typeof iina.core;
  preferences: typeof iina.preferences;
  file?: typeof iina.file;
  utils?: typeof iina.utils;
  global?: typeof iina.global;
  isClosing?: () => boolean;
  buildEmbyHeaders: (apiKey?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  fetchItemMetadata: (serverBase: string, itemId: string, apiKey: string, userId?: string) => Promise<EmbyItemMetadata>;
  log: DebugLogger;
}

export interface SeriesEpisode {
  id: string;
  name: string;
  indexNumber: number;
  duration?: number;
  playUrl: string;
  seasonNumber?: number;
}

export interface SeriesInfo {
  seriesId: string;
  seasonId: string;
  seriesName: string;
  seasonNumber: number;
  currentEpisodeNumber: number;
}

export function createAutoplayManager({
  http,
  mpv,
  core,
  preferences,
  file,
  utils,
  global: iinaGlobal,
  isClosing,
  buildEmbyHeaders,
  fetchItemMetadata,
  log,
}: AutoplayManagerDeps) {
  let lastProcessedEpisodeId: string | null = null;
  let lastProcessedSeriesId: string | null = null;
  let autoplayRequestCounter = 0;
  let autoplayQueued = false;

  async function fetchSeriesEpisodes(
    serverBase: string,
    seriesId: string,
    seasonId: string,
    apiKey: string,
    userId?: string,
  ): Promise<SeriesEpisode[]> {
    try {
      log(`Fetching episodes for series: ${seriesId}, season: ${seasonId}, userId: ${userId || "none"}`);

      const queryParams = [
        `seasonId=${encodeURIComponent(seasonId)}`,
        `fields=${encodeURIComponent("MediaSources,Path,LocationType,IsFolder")}`,
        ...(userId ? [`userId=${encodeURIComponent(userId)}`] : []),
      ].join("&");

      const response = await http.get(`${serverBase}/Shows/${seriesId}/Episodes?${queryParams}&api_key=${apiKey}`, {
        headers: buildEmbyHeaders(apiKey, {
          Accept: "application/json",
        }),
      });

      if (!response.data) {
        throw new Error("No data received from Emby API");
      }

      const episodeData: EmbyItemsResponse<EmbyItemMetadata> =
        typeof response.data === "string" ? JSON.parse(response.data) : response.data;

      if (!episodeData?.Items) {
        log("No episodes found in response");
        return [];
      }

      const episodes: SeriesEpisode[] = episodeData.Items.filter((episode: EmbyItemMetadata) =>
        Boolean(episode.MediaSources && episode.MediaSources.length > 0 && episode.Id),
      ).map((episode: EmbyItemMetadata) => ({
        id: episode.Id,
        name: episode.Name || "",
        indexNumber: Number(episode.IndexNumber) || 0,
        duration: episode.RunTimeTicks,
        playUrl: `${serverBase}/Videos/${episode.Id}/stream?static=true&api_key=${apiKey}`,
      }));

      episodes.sort((left, right) => left.indexNumber - right.indexNumber);

      log(`Fetched ${episodes.length} episodes from series: ${episodes.map((episode) => `E${episode.indexNumber}`).join(", ")}`);
      return episodes;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error fetching series episodes: ${errorMsg}`);
      return [];
    }
  }

  async function getSeriesInfoFromEpisode(
    serverBase: string,
    episodeId: string,
    apiKey: string,
    userId?: string,
  ): Promise<SeriesInfo | null> {
    try {
      log(`Getting series info from episode: ${episodeId}, userId: ${userId || "none"}`);

      const metadata = await fetchItemMetadata(serverBase, episodeId, apiKey, userId);

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
        `Series info: SeriesName=${seriesName}, SeriesId=${seriesId}, SeasonId=${seasonId}, SeasonNumber=${seasonNumber}, EpisodeNumber=${episodeIndexNumber}`,
      );

      return {
        seriesId,
        seasonId,
        seriesName,
        seasonNumber,
        currentEpisodeNumber: episodeIndexNumber,
      };
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error getting series info from episode: ${errorMsg}`);
      return null;
    }
  }

  async function resolveRemainingEpisodes(
    serverBase: string,
    seriesId: string,
    seasonId: string,
    currentEpisodeNumber: number,
    apiKey: string,
    userId?: string,
  ): Promise<SeriesEpisode[]> {
    try {
      const episodes = await fetchSeriesEpisodes(serverBase, seriesId, seasonId, apiKey, userId);
      const currentEpNum = Number(currentEpisodeNumber);
      const remainingEpisodes = episodes.filter((episode) => episode.indexNumber > currentEpNum);

      if (remainingEpisodes.length > 0) {
        log(`Found ${remainingEpisodes.length} remaining episode(s) in current season`);
        return remainingEpisodes;
      }

      log("No remaining episodes in current season, checking next season...");

      const seasonsUrl = userId
        ? `${serverBase}/Shows/${seriesId}/Seasons?userId=${encodeURIComponent(userId)}&api_key=${apiKey}`
        : `${serverBase}/Shows/${seriesId}/Seasons?api_key=${apiKey}`;
      const seasonsResponse = await http.get(seasonsUrl, {
        headers: buildEmbyHeaders(apiKey, { Accept: "application/json" }),
      });

      if (!seasonsResponse.data) return [];

      const seasonsData: EmbyItemsResponse<EmbySeasonItem> =
        typeof seasonsResponse.data === "string" ? JSON.parse(seasonsResponse.data) : seasonsResponse.data;

      if (!seasonsData?.Items || seasonsData.Items.length === 0) return [];

      const sortedSeasons = seasonsData.Items.filter(
        (season: EmbySeasonItem): season is EmbySeasonItem & { IndexNumber: number } =>
          season.IndexNumber !== null && season.IndexNumber !== undefined,
      ).sort((left, right) => (left.IndexNumber || 0) - (right.IndexNumber || 0));

      const currentSeasonIndex = sortedSeasons.findIndex((season) => season.Id === seasonId);
      if (currentSeasonIndex === -1 || currentSeasonIndex >= sortedSeasons.length - 1) {
        log("No next season available — end of series");
        return [];
      }

      const nextSeason = sortedSeasons[currentSeasonIndex + 1];
      log(`Found next season: ${nextSeason.Name} (S${nextSeason.IndexNumber})`);

      const nextSeasonEpisodes = await fetchSeriesEpisodes(serverBase, seriesId, nextSeason.Id, apiKey, userId);
      for (const ep of nextSeasonEpisodes) {
        ep.seasonNumber = nextSeason.IndexNumber;
      }
      return nextSeasonEpisodes;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error resolving remaining episodes: ${errorMsg}`);
      return [];
    }
  }

  function queueRemainingEpisodes(episodes: SeriesEpisode[], seriesName: string, defaultSeasonNumber: number) {
    if (episodes.length === 0) return;
    if (isClosing?.()) {
      log("Window is closing, skipping queueRemainingEpisodes");
      return;
    }

    try {
      const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
      const currentPos = Number(mpv.getNumber("playlist-pos"));

      if (Number.isFinite(currentPos) && currentPos >= 0 && playlistCount > currentPos + 1) {
        for (let i = playlistCount - 1; i > currentPos; i--) {
          try {
            if (isClosing?.()) return;
            mpv.command("playlist-remove", [String(i)]);
          } catch {
            // Ignore removal errors
          }
        }
        log(`Cleaned ${playlistCount - currentPos - 1} stale playlist entries`);
      }

      if (file && utils && typeof file.write === "function") {
        let m3uContent = "#EXTM3U\n";
        for (const episode of episodes) {
          if (isClosing?.()) return;
          const seasonNum = episode.seasonNumber ?? defaultSeasonNumber;
          const episodeTitle = formatFullEpisodeTitle(seriesName, seasonNum, episode.indexNumber, episode.name);
          const cleanTitle = episodeTitle.replace(/[\r\n]+/g, " ");
          m3uContent += `#EXTINF:-1,${cleanTitle}\n${episode.playUrl}\n`;
        }
        const m3uPath = utils.resolvePath("@data/autoplay_queue.m3u8");
        file.write(m3uPath, m3uContent);
        log(`Queueing ${episodes.length} upcoming episode(s) via loadlist: ${m3uPath}`);
        mpv.command("loadlist", [m3uPath, "append"]);
      } else {
        for (const episode of episodes) {
          if (isClosing?.()) return;
          const seasonNum = episode.seasonNumber ?? defaultSeasonNumber;
          const episodeTitle = formatFullEpisodeTitle(seriesName, seasonNum, episode.indexNumber, episode.name);
          mpv.command("loadfile", [episode.playUrl, "append"]);
          log(`Appended to playlist: ${episodeTitle}`);
        }
      }

      autoplayQueued = true;
      log(`Queued ${episodes.length} upcoming episode(s) to playlist`);

      if (iinaGlobal && typeof iinaGlobal.postMessage === "function") {
        iinaGlobal.postMessage("player-next-queued", {
          count: episodes.length,
          firstTitle: episodes[0]?.name,
        });
      }

      if (preferences.get("show_notifications") && episodes.length > 0) {
        const nextTitle = formatFullEpisodeTitle(
          seriesName,
          episodes[0].seasonNumber ?? defaultSeasonNumber,
          episodes[0].indexNumber,
          episodes[0].name,
        );
        core.osd(`Queued ${episodes.length} episodes (Next: ${nextTitle})`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error queuing remaining episodes: ${errorMsg}`);
      console.error(`[iina-emby] Failed to queue remaining episodes: ${errorMsg}`);
    }
  }

  function setupAutoplayForEpisode(serverBase: string, episodeId: string, apiKey: string, userId?: string) {
    if (isClosing?.()) {
      log("Window is closing, skipping setupAutoplayForEpisode");
      return;
    }

    if (lastProcessedEpisodeId === episodeId) {
      log(`Episode ${episodeId} already being processed, skipping duplicate setup`);
      return;
    }

    lastProcessedEpisodeId = episodeId;

    // If the playlist already has upcoming episodes after the current one, no need to re-query
    try {
      const playlistCount = Number(mpv.getNumber("playlist-count") || 0);
      const currentPos = Number(mpv.getNumber("playlist-pos"));
      if (Number.isFinite(currentPos) && currentPos >= 0 && playlistCount > currentPos + 1) {
        log(`Playlist already has ${playlistCount - currentPos - 1} upcoming episode(s), skipping fetch`);
        autoplayQueued = true;
        return;
      }
    } catch {
      // Ignore
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
          `Got series info: series=${seriesInfo.seriesId}, season=${seriesInfo.seasonId}, seasonNum=${seriesInfo.seasonNumber}, currentEp=${seriesInfo.currentEpisodeNumber}`,
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
          userId,
        );

        if (thisRequestId !== autoplayRequestCounter) {
          log(`Autoplay request #${thisRequestId} is stale after resolve, aborting`);
          return;
        }

        if (remainingEpisodes.length === 0) {
          log("No remaining episodes found — end of series");
          return;
        }

        queueRemainingEpisodes(remainingEpisodes, seriesInfo.seriesName, seriesInfo.seasonNumber);

        log(`Autoplay setup complete — queued ${remainingEpisodes.length} upcoming episode(s)`);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Error setting up autoplay: ${errorMsg}`);
      }
    })();
  }

  function resetForNewFile(_episodeId?: string | null) {
    lastProcessedEpisodeId = null;
    autoplayQueued = false;
  }

  function clearQueuedFlag() {
    autoplayQueued = false;
  }

  function isQueued(): boolean {
    return autoplayQueued;
  }

  return {
    setupAutoplayForEpisode,
    resetForNewFile,
    clearQueuedFlag,
    isQueued,
  };
}
