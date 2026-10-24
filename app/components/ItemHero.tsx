import { type EmbyItemMetadata, type EmbyPerson, type EmbyServer, getEmbyImageUrl, getItemImageUrl } from "@shared";
import { IconFingerprint, IconHeart, IconHeartFilled, IconPlayerPlayFilled } from "@tabler/icons-react";
import { useState } from "react";
import { isIdentifySupported } from "../lib/emby-library-client";
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
      const resp = await fetch(url, {
        method: isFavorite ? "DELETE" : "POST",
        headers: {
          "X-Emby-Token": activeServer.accessToken,
          Accept: "application/json",
        },
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

  // Resume position
  const resumeTicks = targetItem?.UserData?.PlaybackPositionTicks;
  const resumeTimeClock = formatResumeTime(resumeTicks);

  // Overview / Synopsis with optional prefix
  let overviewPrefix: string | null = null;
  if (isSeries && nextUpEpisode) {
    const sNum = nextUpEpisode.ParentIndexNumber ?? 1;
    const eNum = nextUpEpisode.IndexNumber ?? 1;
    overviewPrefix = `${item?.Name || "Series"} • Season ${sNum} • Episode ${eNum}`;
  } else if (item?.Name) {
    overviewPrefix = `${item.Name}`;
  }

  const overviewText: string = String(targetItem?.Overview || item?.Overview || "");

  return (
    <>
      {/* Top Crisp Backdrop with smooth downward fade into window background */}
      {backdropUrl ? (
        <div className={styles.backdropContainer}>
          <img src={backdropUrl} alt={item?.Name || "Backdrop"} className={styles.backdropImage} decoding="async" />
          <div className={styles.backdropOverlay} />
        </div>
      ) : null}

      {/* Top Floating Navigation Bar with Back & Refresh */}
      <div className={styles.headerSpacer}>
        <PageHeader
          onBack={onBack}
          backTitle="Back"
          onRefresh={onRefresh}
          isRefreshing={isRefreshing}
          className={styles.pageHeader}
          rightSection={
            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <GlassElement
                variant={isFavorite ? "primary" : "glass"}
                shape="rounded"
                size="sm"
                onClick={toggleFavorite}
                disabled={favUpdating}
                title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
                aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
              >
                <div style={{ display: "flex", alignItems: "center", padding: "0 6px" }}>
                  <span style={{ display: "inline-flex", alignItems: "center", marginRight: "8px" }}>
                    {isFavorite ? <IconHeartFilled size={15} color="#ff4757" /> : <IconHeart size={15} />}
                  </span>
                  <span style={{ fontSize: "0.82rem", fontWeight: 500 }}>{isFavorite ? "Favorited" : "Favorite"}</span>
                </div>
              </GlassElement>
              {canIdentify ? (
                <GlassElement
                  variant="glass"
                  shape="rounded"
                  size="sm"
                  isIconOnly
                  onClick={() => setIsIdentifyOpen(true)}
                  title="Identify"
                  aria-label="Identify metadata"
                >
                  <IconFingerprint size={16} />
                </GlassElement>
              ) : null}
            </div>
          }
        />
      </div>

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
            <span className={styles.syncingBadge} title="Metadata is syncing with server...">
              <span className={styles.syncDot} />
              <span>Syncing with server</span>
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
            aria-label="Play"
            className={styles.playButton}
            leftSection={<IconPlayerPlayFilled size={18} />}
          >
            <span>
              {isSeries && nextUpEpisode
                ? `播放 S${nextUpEpisode.ParentIndexNumber ?? 1}:E${nextUpEpisode.IndexNumber ?? 1}${resumeTimeClock ? ` (${resumeTimeClock})` : ""}`
                : `Play${resumeTimeClock ? ` ${resumeTimeClock}` : ""}`}
            </span>
          </GlassElement>

          <GlassElement
            variant={isFavorite ? "primary" : "glass"}
            shape="rounded"
            size="lg"
            onClick={toggleFavorite}
            disabled={favUpdating}
            title={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
            aria-label={isFavorite ? "Remove from Favorites" : "Add to Favorites"}
          >
            <div style={{ display: "flex", alignItems: "center", padding: "0 8px" }}>
              <span style={{ display: "inline-flex", alignItems: "center", marginRight: "8px" }}>
                {isFavorite ? <IconHeartFilled size={18} color="#ff4757" /> : <IconHeart size={18} />}
              </span>
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>{isFavorite ? "Favorited" : "Favorite"}</span>
            </div>
          </GlassElement>
        </div>

        {/* Selected Tracks Status Pills */}
        {(selectedAudioLabel || selectedSubtitleLabel) && (
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", marginTop: "-6px", marginBottom: "2px" }}>
            {selectedAudioLabel && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "rgba(56, 189, 248, 0.12)",
                  color: "#38bdf8",
                  border: "1px solid rgba(56, 189, 248, 0.3)",
                  borderRadius: "6px",
                  padding: "2px 8px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  marginRight: "8px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ marginRight: "4px" }}>🔊</span>
                <span>音轨: {selectedAudioLabel}</span>
              </span>
            )}
            {selectedSubtitleLabel && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  background: "rgba(192, 132, 252, 0.12)",
                  color: "#c084fc",
                  border: "1px solid rgba(192, 132, 252, 0.3)",
                  borderRadius: "6px",
                  padding: "2px 8px",
                  fontSize: "0.75rem",
                  fontWeight: 500,
                  marginRight: "8px",
                  marginBottom: "4px",
                }}
              >
                <span style={{ marginRight: "4px" }}>💬</span>
                <span>字幕: {selectedSubtitleLabel}</span>
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

function CastSection({ people, server }: CastSectionProps) {
  if (!people || people.length === 0) return null;
  const list = people.slice(0, 10);

  return (
    <section className={styles.castSection}>
      <div className={styles.castHeader}>
        <h3 className={styles.castTitle}>演职人员</h3>
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
                ? "导演"
                : p.Type === "Actor"
                  ? "演员"
                  : p.Type === "Writer"
                    ? "编剧"
                    : p.Type) || "";

          return (
            <div key={p.Id || `person-${idx}`} className={styles.castCard}>
              <div className={styles.castAvatarWrapper}>
                {avatarUrl ? (
                  <img src={avatarUrl} alt={p.Name || ""} className={styles.castAvatar} loading="lazy" decoding="async" />
                ) : (
                  <div className={styles.castAvatarPlaceholder}>
                    <span>{p.Name ? p.Name.charAt(0).toUpperCase() : "?"}</span>
                  </div>
                )}
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
