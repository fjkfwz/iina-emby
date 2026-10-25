import type { EmbyItemMetadata, EmbyPlaybackInfo } from "@shared";
import type { DebugLogger } from "./debug-log";
import type { SafeHttp } from "./safe-http";

export interface PlaybackTrackingDeps {
  core: typeof iina.core;
  http: typeof iina.http | SafeHttp;
  preferences: typeof iina.preferences;
  buildEmbyHeaders: (apiKey?: string, extraHeaders?: Record<string, string>) => Record<string, string>;
  fetchPlaybackInfo: (serverBase: string, itemId: string, apiKey: string) => Promise<EmbyPlaybackInfo>;
  fetchItemMetadata: (serverBase: string, itemId: string, apiKey: string, userId?: string) => Promise<EmbyItemMetadata>;
  secondsToTicks: (seconds: number) => number;
  ticksToSeconds: (ticks: number) => number;
  onProgressUpdated?: (data: { itemId: string; positionTicks: number; isPaused: boolean }) => void;
  log: DebugLogger;
}

export interface PlaybackSession {
  serverBase: string;
  itemId: string;
  apiKey: string;
  userId?: string;
  playSessionId: string | null;
  mediaSourceId: string | null;
  startTime: number;
  resumePosition: number | null;
  hasPerformedInitialSeek?: boolean;
  duration: number | null;
  hasReportedWatched: boolean;
}

export function createPlaybackTrackingManager({
  core,
  http,
  preferences,
  buildEmbyHeaders,
  fetchPlaybackInfo,
  fetchItemMetadata,
  secondsToTicks,
  ticksToSeconds,
  onProgressUpdated,
  log,
}: PlaybackTrackingDeps) {
  let currentPlaybackSession: PlaybackSession | null = null;
  let sessionRequestCounter = 0;
  let lastReportedPosition = 0;
  let lastKnownPosition = 0;
  let hasStartedPlayback = false;
  let playbackTickCount = 0;
  let playbackTickTimer: ReturnType<typeof setInterval> | null = null;

  function samplePosition(): number | null {
    const position = core.status.position;

    if (position === null || position === undefined || position < 0) {
      return null;
    }

    if (position > 0) {
      hasStartedPlayback = true;
      return position;
    }

    return hasStartedPlayback ? 0 : null;
  }

  const PLAYBACK_TICK_INTERVAL = 1000;
  const PROGRESS_REPORT_TICKS = 10;
  const WATCHED_THRESHOLD = 0.95;

  async function fetchResumePosition(serverBase: string, itemId: string, apiKey: string, userId?: string): Promise<number | null> {
    try {
      if (!preferences.get("sync_playback_progress")) {
        log("[resume] Playback progress sync disabled, skipping resume position fetch");
        return null;
      }

      log(`[resume] Requesting metadata for itemId=${itemId}, userId=${userId || "none"}`);
      const metadata = await fetchItemMetadata(serverBase, itemId, apiKey, userId);

      if (!metadata?.UserData) {
        log(`[resume] No UserData found in metadata for itemId=${itemId} (userId=${userId || "none"})`);
        return null;
      }

      const playbackPositionTicks = metadata.UserData.PlaybackPositionTicks;
      const played = metadata.UserData.Played;
      log(
        `[resume] Item ${itemId} (${metadata.Name || "Unknown"}): PlaybackPositionTicks=${playbackPositionTicks}, Played=${played}, RunTimeTicks=${metadata.RunTimeTicks}`,
      );

      if (!playbackPositionTicks || playbackPositionTicks === 0) {
        log(`[resume] No resume position available for itemId=${itemId}`);
        return null;
      }

      // If near the end (>= 95%), don't resume to credits
      if (metadata.RunTimeTicks && playbackPositionTicks / metadata.RunTimeTicks >= WATCHED_THRESHOLD) {
        log(`[resume] Resume position is near the end (>= 95%), starting from beginning for itemId=${itemId}`);
        return null;
      }

      const positionSeconds = ticksToSeconds(playbackPositionTicks);
      log(`[resume] Found valid resume position: ${positionSeconds.toFixed(1)}s (${playbackPositionTicks} ticks) for itemId=${itemId}`);

      return positionSeconds;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`[resume] Error fetching resume position for itemId=${itemId}: ${errorMsg}`);
      return null;
    }
  }

  async function reportPlaybackStart(
    serverBase: string,
    itemId: string,
    apiKey: string,
    playSessionId: string | null,
    mediaSourceId: string | null,
    startPositionSeconds: number = 0,
  ): Promise<boolean> {
    try {
      if (!preferences.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping playback start report");
        return false;
      }

      const positionTicks = secondsToTicks(startPositionSeconds);
      const url = `${serverBase}/Sessions/Playing?api_key=${apiKey}`;
      log(`Reporting playback start for item: ${itemId} at ${startPositionSeconds}s (${positionTicks} ticks)`);

      const response = await http.post(url, {
        headers: buildEmbyHeaders(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          CanSeek: true,
          PlayMethod: "DirectPlay",
          PositionTicks: positionTicks,
        },
      });

      if (response.statusCode >= 400) {
        log(`Playback start failed with status: ${response.statusCode}`);
        return false;
      }

      log(`Playback start reported, status: ${response.statusCode}`);
      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback start: ${errorMsg}`);
      return false;
    }
  }

  async function resumeAndReportStart(
    serverBase: string,
    itemId: string,
    apiKey: string,
    playSessionId: string | null,
    mediaSourceId: string | null,
    userId?: string,
    knownStartPositionSeconds?: number | null,
  ) {
    const session = currentPlaybackSession;

    try {
      let resumePosition: number | null = null;
      if (typeof knownStartPositionSeconds === "number" && knownStartPositionSeconds > 0) {
        resumePosition = knownStartPositionSeconds;
        log(`[resume] Using known initial start position from browser: ${resumePosition.toFixed(1)}s for itemId=${itemId}`);
      } else {
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

      // Report playback start with the actual resume position (not 0!)
      log(
        `[start] Starting playback for itemId=${itemId}, effectiveStart=${effectiveStart}s (${secondsToTicks(effectiveStart)} ticks), reporting to Emby...`,
      );
      reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, effectiveStart);

      if (effectiveStart >= 15) {
        log(`[seek] Scheduled resume seek to ${effectiveStart.toFixed(1)}s for itemId=${itemId} once playback starts`);
      } else {
        log(`[start] No significant resume position (<15s) for itemId=${itemId}, starting from beginning`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`[start] Error resuming and reporting playback start: ${errorMsg}`);
      reportPlaybackStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, 0);
    }
  }

  async function reportPlaybackProgress(
    serverBase: string,
    itemId: string,
    apiKey: string,
    positionSeconds: number,
    playSessionId: string | null,
    mediaSourceId: string | null,
    isPaused: boolean = false,
  ): Promise<boolean> {
    try {
      if (!preferences.get("sync_playback_progress")) {
        return false;
      }

      const positionTicks = secondsToTicks(positionSeconds);
      const url = `${serverBase}/Sessions/Playing/Progress?api_key=${apiKey}`;

      const response = await http.post(url, {
        headers: buildEmbyHeaders(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          PositionTicks: positionTicks,
          IsPaused: isPaused,
          CanSeek: true,
          PlayMethod: "DirectPlay",
        },
      });

      if (response.statusCode >= 400) {
        log(`Progress report failed with status: ${response.statusCode}`);
        return false;
      }

      if (typeof onProgressUpdated === "function") {
        onProgressUpdated({ itemId, positionTicks, isPaused });
      }

      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback progress: ${errorMsg}`);
      return false;
    }
  }

  async function reportPlaybackStop(
    serverBase: string,
    itemId: string,
    apiKey: string,
    positionSeconds: number,
    playSessionId: string | null,
    mediaSourceId: string | null,
  ): Promise<boolean> {
    try {
      if (!preferences.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping playback stop report");
        return false;
      }

      const positionTicks = secondsToTicks(positionSeconds);
      const url = `${serverBase}/Sessions/Playing/Stopped?api_key=${apiKey}`;

      log(`Reporting playback stop: position=${positionSeconds}s (${positionTicks} ticks)`);

      const response = await http.post(url, {
        headers: buildEmbyHeaders(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
        data: {
          ItemId: itemId,
          MediaSourceId: mediaSourceId || itemId,
          PlaySessionId: playSessionId,
          PositionTicks: positionTicks,
        },
      });

      if (response.statusCode >= 400) {
        log(`Playback stop failed with status: ${response.statusCode}`);
        return false;
      }

      log(`Playback stop reported, status: ${response.statusCode}`);
      return response.statusCode === 204 || response.statusCode === 200;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error reporting playback stop: ${errorMsg}`);
      return false;
    }
  }

  async function markAsWatched(serverBase: string, itemId: string, apiKey: string): Promise<boolean> {
    try {
      if (!preferences.get("sync_playback_progress")) {
        log("Playback progress sync disabled, skipping mark as watched");
        return false;
      }

      const url = `${serverBase}/UserPlayedItems/${itemId}?api_key=${apiKey}`;
      log(`Marking item as watched: ${itemId}`);

      const response = await http.post(url, {
        headers: buildEmbyHeaders(apiKey, {
          "Content-Type": "application/json",
          Accept: "application/json",
        }),
      });

      if (response.statusCode >= 400) {
        log(`Mark as watched failed with status: ${response.statusCode}`);
        return false;
      }

      log(`Item marked as watched, status: ${response.statusCode}`);

      if ((response.statusCode === 200 || response.statusCode === 204) && preferences.get("show_notifications")) {
        core.osd("Marked as watched in Emby");
      }

      return response.statusCode === 200 || response.statusCode === 204;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : JSON.stringify(error);
      log(`Error marking item as watched: ${errorMsg}`);
      return false;
    }
  }

  async function startPlaybackTracking(
    serverBase: string,
    itemId: string,
    apiKey: string,
    userId?: string,
    knownStartPositionSeconds?: number | null,
  ) {
    stopPlaybackTracking();

    if (!preferences.get("sync_playback_progress")) {
      log("Playback progress sync disabled");
      return;
    }

    log(`Starting playback tracking for item: ${itemId}`);

    const requestId = ++sessionRequestCounter;

    let playSessionId: string | null = null;
    let mediaSourceId: string | null = null;
    try {
      const playbackInfo = await fetchPlaybackInfo(serverBase, itemId, apiKey);
      if (playbackInfo) {
        playSessionId = playbackInfo.PlaySessionId || null;
        if (playbackInfo.MediaSources && playbackInfo.MediaSources.length > 0) {
          mediaSourceId = playbackInfo.MediaSources[0].Id || null;
        }
        log(`PlaySessionId: ${playSessionId}, MediaSourceId: ${mediaSourceId}`);
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Could not fetch playback info for session: ${errorMsg}`);
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
    };

    resumeAndReportStart(serverBase, itemId, apiKey, playSessionId, mediaSourceId, userId, knownStartPositionSeconds);

    try {
      const duration = core.status.duration;
      if (duration) {
        currentPlaybackSession.duration = duration;
        log(`Media duration: ${duration}s`);
      }
    } catch (error: unknown) {
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
          const duration = core.status.duration;
          if (duration) {
            currentPlaybackSession.duration = duration;
          }
        }

        // Perform deferred resume seek once mpv has actively loaded the stream (duration and position exist)
        const resumePos = currentPlaybackSession.resumePosition;
        if (
          !currentPlaybackSession.hasPerformedInitialSeek &&
          typeof resumePos === "number" &&
          resumePos >= 15 &&
          position !== null &&
          (currentPlaybackSession.duration || 0) > 0
        ) {
          currentPlaybackSession.hasPerformedInitialSeek = true;
          log(`[seek] Performing safe resume seek to ${resumePos.toFixed(1)}s (current mpv position=${position}s)`);
          try {
            core.seekTo(resumePos);
            if (preferences.get("show_notifications")) {
              const minutes = Math.floor(resumePos / 60);
              const seconds = Math.floor(resumePos % 60);
              core.osd(`Resuming at ${minutes}:${seconds.toString().padStart(2, "0")}`);
            }
          } catch (seekErr: unknown) {
            const errorMsg = seekErr instanceof Error ? seekErr.message : String(seekErr);
            log(`[seek] Error during safe resume seek: ${errorMsg}`);
          }
        }

        playbackTickCount++;

        if (playbackTickCount >= PROGRESS_REPORT_TICKS) {
          playbackTickCount = 0;
          const isPaused = core.status.paused || false;
          const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;

          reportPlaybackProgress(serverBase, itemId, apiKey, lastKnownPosition, playSessionId, mediaSourceId, isPaused);

          lastReportedPosition = lastKnownPosition;

          const duration = currentPlaybackSession.duration;
          if (duration && !currentPlaybackSession.hasReportedWatched) {
            const percentComplete = lastKnownPosition / duration;
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

            stopPlaybackTracking();
          }
        }
      } catch (error: unknown) {
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

  function handlePauseChange() {
    if (!currentPlaybackSession) return;

    try {
      const position = samplePosition();
      if (position !== null) {
        lastKnownPosition = position;
      }

      const isPaused = core.status.paused || false;
      const expectedResume = currentPlaybackSession.resumePosition;

      // If we expect to resume at e.g. 489s, but mpv just fired an initial unpause at 0.04s,
      // do NOT report 0.04s to Emby because that wipes out progress on the server!
      if (typeof expectedResume === "number" && expectedResume >= 15 && lastKnownPosition < 5) {
        log(
          `Pause state changed: isPaused=${isPaused}, position=${lastKnownPosition} (ignoring premature position <5s while resume at ${expectedResume}s is pending)`,
        );
        return;
      }

      log(`Pause state changed: isPaused=${isPaused}, position=${lastKnownPosition}`);

      const { serverBase, itemId, apiKey, playSessionId, mediaSourceId } = currentPlaybackSession;

      reportPlaybackProgress(serverBase, itemId, apiKey, lastKnownPosition, playSessionId, mediaSourceId, isPaused);

      playbackTickCount = 0;
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log(`Error in pause change handler: ${errorMsg}`);
    }
  }

  function stopPlaybackTracking() {
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

  function getCurrentPlaybackSession(): PlaybackSession | null {
    return currentPlaybackSession;
  }

  return {
    startPlaybackTracking,
    stopPlaybackTracking,
    handlePauseChange,
    markAsWatched,
    getCurrentPlaybackSession,
  };
}
