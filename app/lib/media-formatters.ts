import { type EmbyItemMetadata, type EmbyMediaStream, ticksToSeconds } from "@shared";

export function formatDuration(ticks?: number): string | null {
  if (!ticks || ticks <= 0) return null;
  const totalMinutes = Math.round(ticksToSeconds(ticks) / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0) {
    return mins > 0 ? `${hours}h${mins}m` : `${hours}h`;
  }
  return `${mins}m`;
}

export function formatPremiereDate(isoDate?: string): string | null {
  if (!isoDate) return null;
  try {
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return null;
  }
}

export function formatResumeTime(ticks?: number): string | null {
  if (!ticks || ticks <= 0) return null;
  const totalSeconds = ticksToSeconds(ticks);
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export interface MediaBadges {
  durationText: string | null;
  premiereDateText: string | null;
  resolutionBadge: string | null;
  hdrBadge: string | null;
  fpsBadge: string | null;
  sizeBadge: string | null;
}

export function getMediaBadges(targetItem?: EmbyItemMetadata, fallbackItem?: EmbyItemMetadata): MediaBadges {
  const activeMediaStreams: EmbyMediaStream[] =
    Array.isArray(targetItem?.MediaStreams) && targetItem.MediaStreams.length > 0
      ? (targetItem.MediaStreams as EmbyMediaStream[])
      : Array.isArray(fallbackItem?.MediaStreams)
        ? (fallbackItem.MediaStreams as EmbyMediaStream[])
        : [];
  const videoStream = activeMediaStreams.find((s) => s.Type === "Video");
  const mediaSource = targetItem?.MediaSources?.[0] || fallbackItem?.MediaSources?.[0];

  const durationText = formatDuration(targetItem?.RunTimeTicks || fallbackItem?.RunTimeTicks);
  const premiereDateText = formatPremiereDate(
    typeof targetItem?.PremiereDate === "string"
      ? targetItem.PremiereDate
      : typeof fallbackItem?.PremiereDate === "string"
        ? fallbackItem.PremiereDate
        : undefined,
  );

  let resolutionBadge: string | null = null;
  if (videoStream?.Width && videoStream.Width >= 3800) {
    resolutionBadge = "4K";
  } else if (videoStream?.Width && videoStream.Width >= 1900) {
    resolutionBadge = "1080p";
  } else if (videoStream?.Width && videoStream.Width >= 1200) {
    resolutionBadge = "720p";
  }

  let hdrBadge: string | null = null;
  const subType = videoStream?.ExtendedVideoSubType as string | undefined;
  if (subType === "DoviProfile81" || subType?.includes("Dovi")) {
    hdrBadge = "DV(P8.1)";
  } else if (videoStream?.VideoRange === "DolbyVision") {
    hdrBadge = "Dolby Vision";
  } else if (videoStream?.VideoRange === "HDR" || String(videoStream?.VideoRange).includes("HDR")) {
    hdrBadge = "HDR";
  }

  let fpsBadge: string | null = null;
  const fps = (videoStream?.RealFrameRate as number | undefined) || (videoStream?.AverageFrameRate as number | undefined);
  if (fps && fps > 0) {
    fpsBadge = `${Math.round(fps)}FPS`;
  }

  let sizeBadge: string | null = null;
  const fileSize = mediaSource?.Size ?? (targetItem?.Size as number | undefined) ?? (fallbackItem?.Size as number | undefined);
  if (fileSize && fileSize > 0) {
    sizeBadge = `${(fileSize / (1024 * 1024 * 1024)).toFixed(2)}G`;
  }

  return {
    durationText,
    premiereDateText,
    resolutionBadge,
    hdrBadge,
    fpsBadge,
    sizeBadge,
  };
}
