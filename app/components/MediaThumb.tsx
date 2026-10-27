import {
  type EmbyItemMetadata,
  type EmbyServer,
  type EmbyUserData,
  formatDuration,
  formatEpisodeSubtitle,
  formatTimeProgress,
  getItemImageUrl,
  isNativeLazyLoadingSupported,
  type PlayMediaPayload,
  ticksToSeconds,
} from "@shared";
import { IconCheck, IconDots, IconInfoCircle, IconMovie, IconPlayerPlay } from "@tabler/icons-react";
import type React from "react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useInView } from "../hooks/useInView";
import { useItemPlayedStatus } from "../hooks/useItemPlayedStatus";
import { buildStreamUrl } from "../lib/emby-library-client";
import { useTranslation } from "../lib/i18n";
import classes from "./MediaThumb.module.css";
import { PlayedConfirmModal, PlayStatusMenuItems } from "./PlayedConfirmModal";
import { DropdownMenu } from "./ui";
import glassStyles from "./ui/GlassElement.module.css";
import { Skeleton } from "./ui/Skeleton";

export function MediaThumbSkeleton({ className }: { className?: string }) {
  return (
    <div className={`${classes.card} ${className || ""}`} aria-hidden="true">
      <div className={classes.preview}>
        <Skeleton height="100%" radius="var(--radius-l)" />
      </div>
      <div className={classes.meta}>
        <span className={classes.title}>
          <Skeleton width="75%" radius="xs">
            <span>&nbsp;</span>
          </Skeleton>
        </span>
        <span className={classes.subtitle}>
          <Skeleton width="45%" radius="xs">
            <span>&nbsp;</span>
          </Skeleton>
        </span>
      </div>
    </div>
  );
}

const loadedThumbUrls = new Set<string>();

export interface MediaThumbProps {
  item: EmbyItemMetadata;
  server: EmbyServer;
  onPlay?: (payload: PlayMediaPayload) => void;
  onClick?: (item: EmbyItemMetadata) => void;
  onUserDataChange?: (item: EmbyItemMetadata, userData: EmbyUserData) => void;
  aspectRatio?: number;
  width?: number | string;
  className?: string;
  title?: string;
  subtitle?: string;
  subtitleLines?: number;
}

export const MediaThumb = memo(function MediaThumb({
  item,
  server,
  onPlay,
  onClick,
  onUserDataChange,
  aspectRatio = 16 / 9,
  width,
  className,
  title: customTitle,
  subtitle: customSubtitle,
  subtitleLines,
}: MediaThumbProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [imageError, setImageError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [useFallback, setUseFallback] = useState(false);
  const retryTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
    };
  }, []);

  const handleImgError = useCallback(() => {
    // If request failed (e.g. proxy congestion / socket drop on initial load), retry with backoff
    if (retryCount < 2) {
      if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
      retryTimerRef.current = setTimeout(() => {
        setRetryCount((prev) => prev + 1);
      }, (retryCount + 1) * 1200);
      return;
    }

    // If retries for thumb exhausted, try primary fallback candidate if available
    if (!useFallback && (item.ImageTags?.Primary || item.SeriesPrimaryImageTag)) {
      setUseFallback(true);
      setRetryCount(0);
      return;
    }

    setImageError(true);
  }, [retryCount, useFallback, item]);
  const {
    isPlayed,
    unplayedCount,
    playbackPositionTicks,
    canMarkPlayed,
    canMarkUnplayed,
    pendingAction,
    isUpdating,
    isConfirmOpen,
    requestMarkPlayed,
    requestMarkUnplayed,
    cancelTogglePlayed,
    confirmTogglePlayed,
  } = useItemPlayedStatus({
    item,
    server,
    onUserDataChange,
  });

  const isEpisode = item.Type === "Episode";
  const defaultTitle = isEpisode ? item.SeriesName || item.Name || "Episode" : item.Name || "Movie";
  const title = customTitle ?? defaultTitle;

  const defaultSubtitle = isEpisode
    ? formatEpisodeSubtitle(item.ParentIndexNumber, item.IndexNumber, item.Name)
    : item.ProductionYear
      ? String(item.ProductionYear)
      : undefined;
  const subtitle = customSubtitle !== undefined ? customSubtitle : defaultSubtitle;

  const candidateStrategy = useFallback ? "primary" : "thumb";
  const rawImageUrl = !imageError
    ? getItemImageUrl(server.serverUrl, item, {
        prefer: candidateStrategy,
        maxWidth: 520,
        maxHeight: 293,
        quality: 85,
        accessToken: server.accessToken,
      })
    : undefined;

  const imageUrl = rawImageUrl
    ? retryCount > 0
      ? `${rawImageUrl}&_r=${retryCount}`
      : rawImageUrl
    : undefined;

  const isNativeLazy = isNativeLazyLoadingSupported();
  const isCached = Boolean(imageUrl && loadedThumbUrls.has(imageUrl));
  const [cardRef, isInView] = useInView<HTMLDivElement>({
    rootMargin: "350px",
    enabled: !isNativeLazy && !isCached,
  });
  const [isLoaded, setIsLoaded] = useState(isCached);

  const shouldRenderImage = isNativeLazy || isInView || isCached;
  const activeImageUrl = shouldRenderImage ? imageUrl : undefined;

  const handleImgLoad = useCallback(() => {
    if (imageUrl) loadedThumbUrls.add(imageUrl);
    setIsLoaded(true);
  }, [imageUrl]);

  const handleRef = useCallback(
    (el: HTMLImageElement | null) => {
      if (!el) return;
      if (el.complete && el.naturalWidth > 0) {
        if (imageUrl) loadedThumbUrls.add(imageUrl);
        setIsLoaded(true);
      }
    },
    [imageUrl],
  );

  const currentSec = ticksToSeconds(playbackPositionTicks);
  const totalSec = ticksToSeconds(item.RunTimeTicks);

  const hasProgress = totalSec > 0 && currentSec > 0;
  const progressPercent = hasProgress ? Math.min(100, Math.max(0, (currentSec / totalSec) * 100)) : 0;

  const timeLabel = hasProgress ? formatTimeProgress(currentSec, totalSec) : totalSec > 0 ? formatDuration(totalSec) : null;

  const fullPlayTitle = customTitle
    ? customTitle
    : isEpisode
      ? `${item.SeriesName || ""} - ${formatEpisodeSubtitle(item.ParentIndexNumber, item.IndexNumber, item.Name)}`
      : item.Name || "";

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onPlay) {
      onPlay({
        streamUrl: buildStreamUrl(server, item.Id),
        title: fullPlayTitle,
        startPositionTicks: playbackPositionTicks,
      });
    }
  };

  const handleDetailClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onClick) {
      onClick(item);
      return;
    }
    const targetId = item.Type === "Episode" && item.SeriesId ? item.SeriesId : item.Id;
    navigate(`/item/${targetId}`, {
      state: targetId === item.Id ? { item } : undefined,
    });
  };

  return (
    <div ref={cardRef} className={`${classes.card} ${className || ""}`} style={{ width: width || "100%" }}>
      <div className={classes.preview}>
        <button
          type="button"
          className={classes.previewBtn}
          style={{ aspectRatio }}
          onClick={handlePlayClick}
          aria-label={`Play ${fullPlayTitle}`}
        ></button>
        {activeImageUrl && !imageError ? (
          <img
            ref={handleRef}
            src={activeImageUrl}
            alt=""
            className={classes.image}
            loading={isNativeLazy ? "lazy" : undefined}
            decoding="async"
            style={{ opacity: isLoaded ? 1 : 0, transition: isCached ? "none" : "opacity 0.2s ease" }}
            onLoad={handleImgLoad}
            onError={handleImgError}
          />
        ) : (
          <div className={classes.placeholder}>
            <IconMovie size={38} stroke={1.5} />
          </div>
        )}

        {/* Top-Right: Unplayed Episode Count OR Played Checkmark */}
        {unplayedCount !== null ? (
          <div className={classes.unplayedBadge} title={`${unplayedCount} unplayed episodes`}>
            {unplayedCount}
          </div>
        ) : isPlayed ? (
          <div className={classes.playedBadge} title="Played">
            <IconCheck size={14} stroke={2.5} />
          </div>
        ) : null}

        {/* Hover play button with liquid glass effect */}
        <div className={classes.hoverOverlay} aria-hidden="true">
          <span className={`${glassStyles.button} ${glassStyles.variantGlass} ${glassStyles.shapeCircle} ${glassStyles.iconLg}`}>
            <span className={glassStyles.lens} />
            <span className={glassStyles.content}>
              <IconPlayerPlay size={22} fill="currentColor" stroke={0} />
            </span>
          </span>
        </div>

        {/* Scrim gradient & time overlay */}
        {timeLabel && (
          <>
            <div className={classes.scrim} />
            <div className={classes.timeOverlay}>
              <span className={classes.timeText}>{timeLabel}</span>
            </div>
          </>
        )}

        {/* White progress bar at the bottom */}
        {hasProgress && (
          <div className={classes.progressBarTrack}>
            <div className={classes.progressBarFill} style={{ width: `${progressPercent}%` }} />
          </div>
        )}

        <DropdownMenu
          trigger={(props) => (
            <button type="button" className={classes.menuBtn} aria-label={t("moreActions", "More actions")} {...props}>
              <IconDots size={14} stroke={2.5} />
            </button>
          )}
        >
          <DropdownMenu.Item icon={<IconInfoCircle size={16} />} onSelect={() => navigate(`/item/${item.Id}`, { state: { item } })}>
            {t("details", "Details")}
          </DropdownMenu.Item>
          {(canMarkPlayed || canMarkUnplayed) && <DropdownMenu.Divider />}
          <PlayStatusMenuItems
            canMarkPlayed={canMarkPlayed}
            canMarkUnplayed={canMarkUnplayed}
            isUpdating={isUpdating}
            onRequestMarkPlayed={requestMarkPlayed}
            onRequestMarkUnplayed={requestMarkUnplayed}
          />
        </DropdownMenu>
      </div>

      {/* Title & subtitle below preview */}
      <button
        type="button"
        className={classes.meta}
        onClick={handleDetailClick}
        aria-label={`View details for ${title}`}
        title={subtitle ? `${title} • ${subtitle}` : title}
      >
        <div className={classes.title}>{title}</div>
        {subtitle && (
          <div
            className={`${classes.subtitle} ${subtitleLines ? classes.subtitleClamped : ""}`}
            style={subtitleLines ? { WebkitLineClamp: subtitleLines } : undefined}
          >
            {subtitle}
          </div>
        )}
      </button>

      {isConfirmOpen && (
        <PlayedConfirmModal
          opened={isConfirmOpen}
          onClose={cancelTogglePlayed}
          onConfirm={confirmTogglePlayed}
          item={item}
          action={pendingAction ?? undefined}
          isLoading={isUpdating}
        />
      )}
    </div>
  );
});
