import {
  type EmbyItemMetadata,
  type EmbyMediaStream,
  type EmbyPlaybackInfo,
  formatFullEpisodeTitle,
  isSameEmbyHost,
  type ParsedEmbyUrl,
} from "@shared";
import type { DebugLogger } from "./debug-log";
import type { SafeHttp } from "./safe-http";
import type { StoredSessionData } from "./server-session-store";

export interface MediaActionsDeps {
  core: typeof iina.core;
  http: typeof iina.http | SafeHttp;
  utils: typeof iina.utils;
  preferences: typeof iina.preferences;
  mpv: typeof iina.mpv;
  parseEmbyUrl: (url: string | null | undefined) => ParsedEmbyUrl | null;
  isEmbyUrl: (url: string | null | undefined) => boolean;
  fetchPlaybackInfo: (serverBase: string, itemId: string, apiKey: string) => Promise<EmbyPlaybackInfo>;
  fetchItemMetadata: (serverBase: string, itemId: string, apiKey: string, userId?: string) => Promise<EmbyItemMetadata>;
  getActiveSession?: () => StoredSessionData | null;
  log: DebugLogger;
}

export function createMediaActionsManager({
  core,
  http,
  utils,
  preferences,
  mpv,
  parseEmbyUrl,
  isEmbyUrl,
  fetchPlaybackInfo,
  fetchItemMetadata,
  getActiveSession,
  log,
}: MediaActionsDeps) {
  let lastEmbyUrl: string | null = null;
  let lastItemId: string | null = null;

  async function setVideoTitleFromMetadata(serverBase: string, itemId: string, apiKey: string, userId?: string) {
    try {
      if (!preferences.get("set_video_title")) {
        log("Video title setting is disabled in preferences");
        return;
      }

      // If userId or connected credentials weren't provided, try resolving from active session
      if (!userId && getActiveSession) {
        const session = getActiveSession();
        if (session?.userId && isSameEmbyHost(session.serverUrl, serverBase)) {
          userId = session.userId;
          if (preferences.get("use_connected_account") && session.accessToken) {
            apiKey = session.accessToken;
            serverBase = session.serverUrl;
          }
        }
      }

      const metadata = await fetchItemMetadata(serverBase, itemId, apiKey, userId);

      if (!metadata?.Name) {
        log("No title found in metadata");
        return;
      }

      let seriesName = metadata.SeriesName;
      if (metadata.Type === "Episode" && !seriesName && metadata.SeriesId) {
        try {
          const seriesMetadata = await fetchItemMetadata(serverBase, metadata.SeriesId, apiKey, userId);
          if (seriesMetadata?.Name) {
            seriesName = seriesMetadata.Name;
          }
        } catch {
          // Ignore series fetch failure
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
      if (typeof mpv !== "undefined" && typeof mpv.set === "function") {
        try {
          mpv.set("force-media-title", title);
          titleSet = true;
          log(`Video title set via mpv force-media-title: ${title}`);
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log(`mpv.set('force-media-title') failed: ${errorMsg}`);
        }

        try {
          mpv.set("title", title);
          log(`Video title set via mpv title: ${title}`);
        } catch {
          // mpv.title might be read-only or unsupported, ignore
        }
      }

      if (!titleSet) {
        log(`Could not set title via IINA API, title would be: ${title}`);
      }

      if (preferences.get("show_notifications")) {
        core.osd(`Title: ${title}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error setting video title: ${errorMsg}`);
    }
  }

  function subtitleExtensionForCodec(codec?: string): string {
    if (codec === "subrip") return "srt";
    if (codec === "webvtt" || codec === "vtt") return "vtt";
    if (codec === "ass") return "ass";
    if (codec === "ssa") return "ssa";
    if (codec?.toLowerCase().includes("srt")) return "srt";
    if (codec?.toLowerCase().includes("vtt")) return "vtt";
    return "srt";
  }

  async function downloadExternalSubtitle(
    serverBase: string,
    itemId: string,
    mediaSourceId: string | null | undefined,
    streamIndex: number | undefined,
    subtitlePath: string | undefined,
    apiKey: string,
    language: string,
    codec?: string,
  ): Promise<boolean> {
    try {
      const extension = subtitleExtensionForCodec(codec);

      const subtitleUrl = `${serverBase}/Videos/${itemId}/${mediaSourceId || itemId}/Subtitles/${streamIndex}/stream.${extension}?api_key=${apiKey}`;

      const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_");
      let suffix: string;
      if (subtitlePath) {
        const pathParts = subtitlePath.split(/[/\\]/);
        suffix = pathParts[pathParts.length - 1].replace(/[^a-zA-Z0-9._-]/g, "_");
      } else {
        const sanitizedLanguage = String(language).replace(/[^a-zA-Z0-9_-]/g, "_");
        suffix = `${sanitizedLanguage}.${extension}`;
      }

      const fileName = `emby_${sanitizedItemId}_${streamIndex}_${suffix}`;
      log(`Using filename: ${fileName}`);

      const localPath = `@tmp/${fileName}`;

      log(`Loading external subtitle via MPV: ${subtitleUrl}`);
      log(`External subtitle path: ${subtitlePath}`);
      log(`Stream index: ${streamIndex}`);
      log(`Language: ${language}`);
      log(`Codec: ${codec} -> Extension: ${extension}`);

      // Use MPV's native sub-add command with direct stream URL to avoid blocking utils.exec / curl crashes
      try {
        mpv.command("sub-add", subtitleUrl, "select");
        log(`External subtitle loaded successfully via mpv sub-add: ${subtitleUrl}`);
      } catch (subErr) {
        log(`mpv.command sub-add error, trying core.subtitle.loadTrack:`, subErr);
        try {
          core.subtitle.loadTrack(subtitleUrl);
          log(`External subtitle loaded successfully via core.subtitle.loadTrack`);
        } catch (coreErr) {
          log(`core.subtitle.loadTrack also failed:`, coreErr);
          return false;
        }
      }

      if (preferences.get("show_notifications")) {
        core.osd(`Loaded external ${language} subtitle`);
      }

      return true;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error downloading external subtitle: ${errorMsg}`);
      return false;
    }
  }

  async function downloadAllSubtitles(serverBase: string, itemId: string, apiKey: string) {
    try {
      const playbackInfo = await fetchPlaybackInfo(serverBase, itemId, apiKey);

      if (!playbackInfo.MediaSources || playbackInfo.MediaSources.length === 0) {
        log("No media sources found");
        return;
      }

      const mediaSource = playbackInfo.MediaSources[0];
      const mediaStreams = mediaSource.MediaStreams || [];

      const subtitleStreams = mediaStreams.filter(
        (stream: EmbyMediaStream) => stream.Type === "Subtitle" && stream.IsTextSubtitleStream && stream.IsExternal,
      );

      log(`Found ${subtitleStreams.length} external subtitle stream(s)`);

      const preferredLanguages = ((preferences.get("preferred_languages") as string) || "en,eng")
        .split(",")
        .map((lang) => lang.trim().toLowerCase())
        .filter((lang) => lang.length > 0);
      const shouldDownloadAll = preferences.get("download_all_subtitles") as boolean;

      let downloadedCount = 0;

      for (const stream of subtitleStreams) {
        const language = stream.Language || "unknown";
        const codec = stream.Codec || "srt";

        const shouldDownload =
          shouldDownloadAll ||
          preferredLanguages.some((prefLang) => language.toLowerCase().includes(prefLang) || prefLang.includes(language.toLowerCase()));

        if (!shouldDownload) {
          log(`Skipping subtitle: ${language} (not in preferred languages)`);
          continue;
        }

        log(`Processing external subtitle: ${language} (${codec}) - Index: ${stream.Index}`);

        try {
          const downloaded = await downloadExternalSubtitle(
            serverBase,
            itemId,
            mediaSource.Id,
            stream.Index,
            stream.Path,
            apiKey,
            language,
            codec,
          );
          if (downloaded) {
            downloadedCount++;
          }
        } catch (error: unknown) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          log(`Failed to download subtitle ${language}: ${errorMsg}`);
        }
      }

      if (downloadedCount > 0 && preferences.get("show_notifications")) {
        core.osd(`Downloaded ${downloadedCount} subtitle(s)`);
      } else if (downloadedCount === 0) {
        log("No external subtitles downloaded");
        if (preferences.get("show_notifications")) {
          core.osd("No matching external subtitles found");
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error downloading subtitles: ${errorMsg}`);
      if (preferences.get("show_notifications")) {
        core.osd("Failed to download subtitles");
      }
    }
  }

  function updateLastFromCurrentUrl(currentUrl: string): ParsedEmbyUrl | null {
    const embyInfo = parseEmbyUrl(currentUrl);
    if (!embyInfo) {
      log(`Failed to parse Emby URL: ${currentUrl}`);
      return null;
    }

    lastEmbyUrl = currentUrl;
    lastItemId = embyInfo.itemId;
    return embyInfo;
  }

  function resolveCurrentEmbyUrl(): string | null {
    let currentUrl = lastEmbyUrl;

    if (!currentUrl) {
      try {
        const currentFile = core.status.url;
        log(`No stored URL, core.status.url = "${currentFile}"`);

        if (currentFile && isEmbyUrl(currentFile)) {
          currentUrl = currentFile;
          log(`Using current file URL: ${currentUrl}`);
        } else {
          log("Current file is not an Emby URL or is empty");
        }
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Error getting current file URL: ${errorMsg}`);
      }
    }

    return currentUrl;
  }

  function manualDownloadSubtitles() {
    log("Manual download requested");
    log(`lastEmbyUrl = "${lastEmbyUrl}"`);

    const currentUrl = resolveCurrentEmbyUrl();
    if (!currentUrl) {
      log("No Emby URL found - checking for Emby URL in current file");
      core.osd("No Emby media detected. Please open an Emby URL first.");
      return;
    }

    log(`Attempting to download subtitles for: ${currentUrl}`);

    if (!isEmbyUrl(currentUrl)) {
      log(`URL is not an Emby URL: ${currentUrl}`);
      core.osd("Current media is not from Emby");
      return;
    }

    const embyInfo = updateLastFromCurrentUrl(currentUrl);
    if (!embyInfo) {
      core.osd("Failed to parse Emby URL - check console for details");
      return;
    }

    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;

    if (getActiveSession) {
      const session = getActiveSession();
      if (session?.userId && isSameEmbyHost(session.serverUrl, reportServerBase)) {
        if (preferences.get("use_connected_account") && session.accessToken) {
          reportApiKey = session.accessToken;
          reportServerBase = session.serverUrl;
        }
      }
    }

    log(`Downloading subtitles for item: ${embyInfo.itemId}`);
    core.osd("Downloading subtitles...");
    downloadAllSubtitles(reportServerBase, embyInfo.itemId, reportApiKey);
  }

  function manualSetTitle() {
    log("Manual title setting requested");
    log(`lastEmbyUrl = "${lastEmbyUrl}"`);

    const currentUrl = resolveCurrentEmbyUrl();
    if (!currentUrl) {
      log("No Emby URL found - checking for Emby URL in current file");
      core.osd("No Emby media detected. Please open an Emby URL first.");
      return;
    }

    log(`Attempting to set title for: ${currentUrl}`);

    if (!isEmbyUrl(currentUrl)) {
      log(`URL is not an Emby URL: ${currentUrl}`);
      core.osd("Current media is not from Emby");
      return;
    }

    const embyInfo = updateLastFromCurrentUrl(currentUrl);
    if (!embyInfo) {
      core.osd("Failed to parse Emby URL - check console for details");
      return;
    }

    let reportServerBase = embyInfo.serverBase;
    let reportApiKey = embyInfo.apiKey;
    let reportUserId: string | undefined;

    if (getActiveSession) {
      const session = getActiveSession();
      if (session?.userId && isSameEmbyHost(session.serverUrl, reportServerBase)) {
        reportUserId = session.userId;
        if (preferences.get("use_connected_account") && session.accessToken) {
          reportApiKey = session.accessToken;
          reportServerBase = session.serverUrl;
        }
      }
    }

    log(`Setting title for item: ${embyInfo.itemId}`);
    core.osd("Fetching title...");
    setVideoTitleFromMetadata(reportServerBase, embyInfo.itemId, reportApiKey, reportUserId);
  }

  function updateFromFileUrl(fileUrl: string | null | undefined): ParsedEmbyUrl | null {
    if (isEmbyUrl(fileUrl)) {
      const embyInfo = parseEmbyUrl(fileUrl);
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

  function getLastItemId(): string | null {
    return lastItemId;
  }

  return {
    setVideoTitleFromMetadata,
    downloadAllSubtitles,
    downloadExternalSubtitle,
    manualDownloadSubtitles,
    manualSetTitle,
    updateFromFileUrl,
    getLastItemId,
  };
}
