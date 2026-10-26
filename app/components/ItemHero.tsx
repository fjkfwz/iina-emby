import { type EmbyItemMetadata, type EmbyPerson, type EmbyServer, getEmbyImageUrl, getItemImageUrl } from "@shared";
import { IconFingerprint, IconHeart, IconHeartFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "../lib/i18n";
import { embyFetch, isIdentifySupported } from "../lib/emby-library-client";
import { formatResumeTime, getMediaBadges } from "../lib/media-formatters";
import { queryClient } from "../lib/query-client";
import { embyKeys } from "../lib/query-keys";
import { IdentifyModal } from "./IdentifyModal";
import styles from "./ItemHero.module.css";
import { PageHeader } from "./PageHeader";
import { GlassElement } from "./ui/GlassElement";

export interface ItemHeroProps {
  item?: EmbyItemMetadata;
  nextUpEpisode?: EmbyItemMetadata | null;
  activeServer: EmbyServer;
  isPlaying?: boolean;
  onPlay: () => void;
  onBack: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  selectedAudioLabel?: string;
  selectedSubtitleLabel?: string;
}

export function ItemHero({
  item,
  nextUpEpisode,
  activeServer,
  isPlaying = false,
  onPlay,
  onBack,
  onRefresh,
  isRefreshing = false,
  selectedAudioLabel,
  selectedSubtitleLabel,
}: ItemHeroProps) {
  const { t } = useTranslation();
  const [logoError, setLogoError] = useState(false);
  const [isIdentifyOpen, setIsIdentifyOpen] = useState(false);
  const [favUpdating, setFavUpdating] = useState(false);

  const isFavorite = Boolean(item?.UserData?.IsFavorite);

  const toggleFavorite = async () => {
    if (!item?.Id || favUpdating) return;
    setFavUpdating(true);
    try {
      const base = activeServer.serverUrl.replace(/\/+$/, "");
      const url = `${base}/Users/${encodeURIComponent(activeServer.userId)}/FavoriteItems/${encodeURIComponent(item.Id)}`;
      const resp = await embyFetch(activeServer, url, {
        method: isFavorite ? "DELETE" : "POST",
      });
      if (resp.ok) {
        const updatedUserData = await resp.json();
        queryClient.setQueryData<EmbyItemMetadata>(embyKeys.item(activeServer.id, item.Id), (old) => {
          if (!old) return old;
          return {
            ...old,
            UserData: {
              ...old.UserData,
              ...updatedUserData,
              IsFavorite: !isFavorite,
            },
          };
        });
        queryClient.invalidateQueries({ queryKey: [...embyKeys.server(activeServer.id), "favorites"] });
      }
    } catch (err) {
      console.error("Toggle favorite failed:", err);
    } finally {
      setFavUpdating(false);
    }
  };

  const canIdentify = Boolean(activeServer.user?.Policy?.IsAdministrator) && isIdentifySupported(item?.Type);
  const isSeries = item?.Type === "Series";

  // The active playable target (episode if Series has NextUp, or the movie item itself)
  const targetItem = isSeries ? nextUpEpisode : item;

  const isSyncing = Boolean(item?.isIdentifying);
  const pendingImg = item?.pendingImageUrl as string | undefined;

  // Backdrop image (high-res fanart backdrop priority or TMDb pending image)
  const backdropUrl =
    pendingImg ||
    (item
      ? getItemImageUrl(activeServer.serverUrl, item, {
          prefer: "backdrop",
          maxWidth: 2560,
          accessToken: activeServer.accessToken,
        })
      : undefined);

  // Logo: check item's ImageTags.Logo (hide if pending image is active to avoid showing old logo over new movie)
  const logoTag = item?.ImageTags?.Logo;
  const logoUrl =
    !logoError && !pendingImg && logoTag && item
      ? getEmbyImageUrl(activeServer.serverUrl, item.Id, {
          imageType: "Logo",
          maxWidth: 600,
          tag: logoTag,
          accessToken: activeServer.accessToken,
        })
      : undefined;

  // Star rating
  const rating = typeof item?.CommunityRating === "number" && item.CommunityRating > 0 ? item.CommunityRating.toFixed(1) : null;

  // Official certification rating (e.g. R, TV-MA, PG-13)
  const officialRating = (item?.OfficialRating as string | undefined) || null;

  // Genres
  const genresList: string[] =
    Array.isArray(item?.Genres) && item.Genres.length > 0
      ? (item.Genres as string[])
      : Array.isArray(item?.GenreItems)
        ? (item.GenreItems as Array<{ Name: string }>).map((g) => g.Name)
        : [];
  const genresText = genresList.join(" • ");

  // Technical specs & badges
  const { durationText, premiereDateText, resolutionBadge, hdrBadge, fpsBadge, sizeBadge } = getMediaBadges(targetItem || undefined, item);

  // Resume position & progress
  const resumeTicks = targetItem?.UserData?.PlaybackPositionTicks || item?.UserData?.PlaybackPositionTicks || 0;
  const runtimeTicks = targetItem?.RunTimeTicks || item?.RunTimeTicks || 0;
  const hasProgress = runtimeTicks > 0 && resumeTicks > 0;
  const progressPercent = hasProgress ? Math.min(100, Math.max(0, (resumeTicks / runtimeTicks) * 100)) : 0;
  const resumeTimeClock = formatResumeTime(resumeTicks);

  // Overview / Synopsis with optional prefix
  let overviewPrefix: string | null = null;
  if (isSeries && nextUpEpisode) {
    const sNum = nextUpEpisode.ParentIndexNumber ?? 1;
    const eNum = nextUpEpisode.IndexNumber ?? 1;
    overviewPrefix = `${item?.Name || t("series", "Series")} • ${t("season", "Season")} ${sNum} • ${t("episode", "Episode")} ${eNum}`;
  } else if (item?.Name) {
    overviewPrefix = `${item.Name}`;
  }

  const overviewText: string = String(targetItem?.Overview || item?.Overview || "");

  return (
    <>
      {/* Top Crisp Backdrop with smooth downward fade into window background */}
      {backdropUrl ? (
        <div className={styles.backdropContainer}>
          <img
            src={backdropUrl}
            alt={item?.Name || "Backdrop"}
            className={styles.backdropImage}
            decoding="async"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = "none";
            }}
          />
          <div className={styles.backdropOverlay} />
        </div>
      ) : null}

      {/* Top Floating Navigation Bar with Back & Refresh */}
      <PageHeader
        onBack={onBack}
        backTitle={t("back", "Back")}
        onRefresh={onRefresh}
        isRefreshing={isRefreshing}
        className={styles.pageHeader}
        shadowOnScroll
        rightSection={
          canIdentify ? (
            <GlassElement
              variant="glass"
              shape="rounded"
              size="sm"
              isIconOnly
              onClick={() => setIsIdentifyOpen(true)}
              title={t("identify", "Identify")}
              aria-label={t("identify", "Identify")}
            >
              <IconFingerprint size={16} />
            </GlassElement>
          ) : undefined
        }
      />

      {/* Hero Layout */}
      <main className={styles.heroContent}>
        {/* Title / Logo */}
        <div className={styles.titleArea}>
          {logoUrl ? (
            <img src={logoUrl} alt={item?.Name || "Logo"} className={styles.logoImage} onError={() => setLogoError(true)} />
          ) : (
            <h1 className={styles.titleFallback}>{item?.Name || "Media"}</h1>
          )}
        </div>

        {/* Metadata Badges (Rating, Specs, Genres) */}
        <div className={styles.metaRow}>
          {rating ? (
            <span className={styles.starRating}>
              <span className={styles.starIcon}>★</span>
              <span>{rating}</span>
            </span>
          ) : null}

          {officialRating ? <span className={styles.officialRatingBadge}>{officialRating}</span> : null}

          {durationText ? <span className={styles.specBadge}>{durationText}</span> : null}
          {premiereDateText ? <span className={styles.specBadge}>{premiereDateText}</span> : null}
          {resolutionBadge ? <span className={styles.specBadge}>{resolutionBadge}</span> : null}
          {hdrBadge ? <span className={styles.specBadge}>{hdrBadge}</span> : null}
          {fpsBadge ? <span className={styles.specBadge}>{fpsBadge}</span> : null}
          {sizeBadge ? <span className={styles.specBadge}>{sizeBadge}</span> : null}

          {genresText ? <span className={styles.genres}>{genresText}</span> : null}

          {isSyncing && (
            <span className={styles.syncingBadge} title={t("syncingWithServer", "Metadata is syncing with server...")}>
              <span className={styles.syncDot} />
              <span>{t("syncingWithServer", "Syncing with server")}</span>
            </span>
          )}
        </div>

        {/* Action Row */}
        <div className={styles.actionRow}>
          <GlassElement
            variant="primary"
            size="lg"
            shape="rounded"
            onClick={onPlay}
            disabled={isPlaying || (isSeries && !nextUpEpisode)}
            aria-label={t("play", "Play")}
            className={styles.playButton}
            leftSection={<IconPlayerPlayFilled size={18} />}
          >
            <span>
              {isSeries && nextUpEpisode
                ? `${t("play", "Play")} S${nextUpEpisode.ParentIndexNumber ?? 1}:E${nextUpEpisode.IndexNumber ?? 1}${resumeTimeClock ? ` (${resumeTimeClock} · ${Math.round(progressPercent)}%)` : ""}`
                : hasProgress
                  ? `${t("resume", "Resume")} (${resumeTimeClock} · ${Math.round(progressPercent)}%)`
                  : t("play", "Play")}
            </span>
            {hasProgress && (
              <div className={styles.playButtonProgressBarTrack}>
                <div className={styles.playButtonProgressBarFill} style={{ width: `${progressPercent}%` }} />
              </div>
            )}
          </GlassElement>

          <GlassElement
            variant={isFavorite ? "primary" : "glass"}
            shape="rounded"
            size="lg"
            onClick={toggleFavorite}
            disabled={favUpdating}
            title={isFavorite ? t("removeFromFavorites", "Remove from Favorites") : t("addToFavorites", "Add to Favorites")}
            aria-label={isFavorite ? t("removeFromFavorites", "Remove from Favorites") : t("addToFavorites", "Add to Favorites")}
            leftSection={
              isFavorite ? (
                <IconHeartFilled size={18} color="#ff4757" />
              ) : (
                <IconHeart size={18} />
              )
            }
          >
            <span>{isFavorite ? t("favorited", "Favorited") : t("favorite", "Favorite")}</span>
          </GlassElement>
        </div>

        {/* Selected Tracks Status Pills */}
        {(selectedAudioLabel || selectedSubtitleLabel) && (
          <div className={styles.trackPillsRow}>
            {selectedAudioLabel && (
              <span className={`${styles.trackPill} ${styles.audioPill}`}>
                <span className={styles.trackPillIcon}>🔊</span>
                <span>{t("audio", "Audio")}: {selectedAudioLabel}</span>
              </span>
            )}
            {selectedSubtitleLabel && (
              <span className={`${styles.trackPill} ${styles.subtitlePill}`}>
                <span className={styles.trackPillIcon}>💬</span>
                <span>{t("subtitle", "Subtitle")}: {selectedSubtitleLabel}</span>
              </span>
            )}
          </div>
        )}

        {/* Overview / Synopsis */}
        {overviewText ? (
          <div className={styles.overviewContainer}>
            <p className={styles.overview}>
              {overviewPrefix ? <strong className={styles.overviewPrefix}>{overviewPrefix} • </strong> : null}
              {overviewText}
            </p>
          </div>
        ) : null}

        {/* Full-width Cast & Crew Section */}
        {item?.People && item.People.length > 0 && <CastSection people={item.People} server={activeServer} />}
      </main>

      {canIdentify && item && isIdentifyOpen && (
        <IdentifyModal
          opened={isIdentifyOpen}
          onClose={() => setIsIdentifyOpen(false)}
          item={item}
          server={activeServer}
          onSuccess={(result) => {
            console.log(`[ItemHero:Identify] Identify completed for "${item.Name}" (${item.Id}) with:`, result);
            if (result && activeServer) {
              const pendingImage = result.ImageUrl || result.ThumbnailUrl;
              queryClient.setQueryData<EmbyItemMetadata>(embyKeys.item(activeServer.id, item.Id), (old) => {
                if (!old) return old;
                return {
                  ...old,
                  Name: result.Name || old.Name,
                  ProductionYear: result.ProductionYear ?? old.ProductionYear,
                  PremiereDate: result.PremiereDate ?? old.PremiereDate,
                  Overview: result.Overview ?? old.Overview,
                  ProviderIds: { ...(old.ProviderIds || {}), ...(result.ProviderIds || {}) },
                  pendingImageUrl: pendingImage,
                  isIdentifying: true,
                };
              });
            }
          }}
        />
      )}
    </>
  );
}

interface CastSectionProps {
  people: EmbyPerson[];
  server: EmbyServer;
}

function CastAvatar({ name, avatarUrl }: { name?: string; avatarUrl: string | null }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (!avatarUrl || hasError) {
    return (
      <div className={styles.castAvatarPlaceholder}>
        <span>{name ? name.charAt(0).toUpperCase() : "?"}</span>
      </div>
    );
  }

  return (
    <img
      src={avatarUrl}
      alt={name || ""}
      className={styles.castAvatar}
      loading="eager"
      decoding="async"
      style={{ opacity: isLoaded ? 1 : 0, transition: "opacity 0.2s ease" }}
      onLoad={() => setIsLoaded(true)}
      onError={() => setHasError(true)}
      ref={(el) => {
        if (el && el.complete && el.naturalWidth > 0) {
          setIsLoaded(true);
        }
      }}
    />
  );
}

function CastSection({ people, server }: CastSectionProps) {
  const { t } = useTranslation();
  if (!people || people.length === 0) return null;
  const list = people.slice(0, 10);

  return (
    <section className={styles.castSection}>
      <div className={styles.castHeader}>
        <h3 className={styles.castTitle}>{t("cast", "Cast & Crew")}</h3>
      </div>
      <div className={styles.castScroller}>
        {list.map((p, idx) => {
          const avatarUrl =
            p.PrimaryImageTag && server
              ? getEmbyImageUrl(server.serverUrl, p.Id || "", {
                  imageType: "Primary",
                  maxWidth: 160,
                  maxHeight: 160,
                  quality: 80,
                  tag: p.PrimaryImageTag,
                  accessToken: server.accessToken,
                })
              : null;
          const role =
            (p.Role && p.Role !== "None"
              ? p.Role
              : p.Type === "Director"
                ? t("director", "Director")
                : p.Type === "Actor"
                  ? t("actor", "Actor")
                  : p.Type === "Writer"
                    ? t("writer", "Writer")
                    : p.Type) || "";

          return (
            <div key={p.Id || `person-${idx}`} className={styles.castCard}>
              <div className={styles.castAvatarWrapper}>
                <CastAvatar name={p.Name} avatarUrl={avatarUrl} />
              </div>
              <span className={styles.castName} title={p.Name}>
                {p.Name}
              </span>
              {role ? (
                <span className={styles.castRole} title={role}>
                  {role}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}
