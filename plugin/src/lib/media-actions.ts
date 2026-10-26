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
  http: SafeHttp;
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
    deliveryUrl?: string | null,
    subtitleTitle?: string | null,
  ): Promise<boolean> {
    try {
      const extension = subtitleExtensionForCodec(codec);
      let subtitleUrl: string;

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
            const pb = await fetchPlaybackInfo(serverBase, itemId, apiKey);
            effectiveMediaSourceId = pb.MediaSources?.[0]?.Id;
          } catch {
            // Ignore fetch error
          }
        }
        const cleanBase = serverBase.replace(/\/+$/, "");
        subtitleUrl = `${cleanBase}/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(effectiveMediaSourceId || itemId)}/Subtitles/${streamIndex}/Stream.${extension}?api_key=${encodeURIComponent(apiKey)}`;
      }

      // Build a clean, human-readable track name for IINA's subtitle menu
      let trackLabel = (subtitleTitle || "").trim();
      if (!trackLabel) {
        if (language && language !== "und" && language !== "unknown") {
          trackLabel = language.toUpperCase();
        } else {
          trackLabel = "字幕";
        }
      }

      // Map raw ISO language codes to readable names if title is just the code
      const lower = trackLabel.toLowerCase();
      if (lower === "chi" || lower === "zho" || lower === "zh" || lower === "zh-cn") {
        trackLabel = "简体中文";
      } else if (lower === "zh-tw" || lower === "zh-hk") {
        trackLabel = "繁体中文";
      } else if (lower === "eng" || lower === "en") {
        trackLabel = "英语";
      } else if (lower === "jpn" || lower === "ja") {
        trackLabel = "日语";
      } else if (lower === "kor" || lower === "ko") {
        trackLabel = "韩语";
      }

      // Strip redundant extension from the label if present
      trackLabel = trackLabel.replace(new RegExp(`\\.${extension}$`, "i"), "").trim();

      // Ensure clear [外挂] prefix so it's distinguishable in IINA subtitle menu
      if (!trackLabel.startsWith("[外挂]")) {
        trackLabel = `[外挂] ${trackLabel}`;
      }

      // Sanitize forbidden filesystem characters without stripping Chinese/Unicode characters
      const safeTitle = trackLabel.replace(/[/\\:*?"<>|\x00-\x1f]/g, "_").trim() || `[外挂] 字幕`;
      const fileName = `${safeTitle}.${extension}`;

      const sanitizedItemId = String(itemId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const safeStreamIndex = typeof streamIndex === "number" ? streamIndex : 0;
      const localPath = `@tmp/emby_${sanitizedItemId}_${safeStreamIndex}/${fileName}`;
      log(`Using filename: ${fileName}, localPath: ${localPath}`);

      log(`Downloading external subtitle: ${subtitleUrl} to ${localPath}`);
      log(`External subtitle path: ${subtitlePath}`);
      log(`Stream index: ${streamIndex}`);
      log(`Language: ${language}`);
      log(`Codec: ${codec} -> Extension: ${extension}`);

      await http.download(subtitleUrl, localPath);

      const resolvedPath = typeof utils.resolvePath === "function" ? utils.resolvePath(localPath) : localPath;
      log(`External subtitle downloaded to: ${resolvedPath}`);

      // Check if file was downloaded and is non-empty
      try {
        const statRes = await utils.exec("/usr/bin/test", ["-s", resolvedPath]);
        if (statRes.status !== 0) {
          log.error(`Downloaded subtitle file is empty or does not exist: ${resolvedPath}`);
          return false;
        }
      } catch {
        // Ignore test error
      }

      let loaded = false;
      try {
        core.subtitle.loadTrack(resolvedPath);
        loaded = true;
        log(`External subtitle loaded successfully via core.subtitle.loadTrack: ${resolvedPath}`);
      } catch (coreErr) {
        log(`core.subtitle.loadTrack error, trying mpv sub-add:`, coreErr);
        try {
          mpv.command("sub-add", [resolvedPath, "select"]);
          loaded = true;
          log(`External subtitle loaded successfully via mpv sub-add: ${resolvedPath}`);
        } catch (mpvErr) {
          log.error(`mpv sub-add also failed:`, mpvErr);
          return false;
        }
      }

      // Verify and ensure active subtitle track is selected
      try {
        const currentSid = mpv.getString("sid");
        if (currentSid === "no" || currentSid === "0") {
          const trackList = mpv.getNative<Array<{ id: number; type: string; external?: boolean }>>("track-list");
          if (Array.isArray(trackList)) {
            const subTracks = trackList.filter((t) => t.type === "sub");
            if (subTracks.length > 0) {
              const lastTrack = subTracks[subTracks.length - 1];
              log(`Activating newly loaded subtitle track: id=${lastTrack.id}`);
              mpv.set("sid", lastTrack.id);
              if (core.subtitle) {
                core.subtitle.id = lastTrack.id;
              }
            }
          }
        }
      } catch {
        // Ignore selection verification errors
      }

      if (preferences.get("show_notifications")) {
        core.osd(`Loaded external ${language} subtitle`);
      }

      return loaded;
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
          const streamTitle = stream.DisplayTitle || stream.Title || stream.DisplayLanguage || stream.Language;
          const downloaded = await downloadExternalSubtitle(
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
