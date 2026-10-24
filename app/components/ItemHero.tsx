import { type EmbyItemMetadata, type EmbyPerson, type EmbyServer, getEmbyImageUrl, getItemImageUrl } from "@shared";
import { IconFingerprint, IconPlayerPlayFilled } from "@tabler/icons-react";
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
}: ItemHeroProps) {
  const [logoError, setLogoError] = useState(false);
  const [isIdentifyOpen, setIsIdentifyOpen] = useState(false);

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
      {/* Ambient Blurred Backdrop providing dominant background color */}
      {backdropUrl ? (
        <div className={styles.ambientBackdrop} aria-hidden="true">
          <img src={backdropUrl} alt="" className={styles.ambientImage} />
          <div className={styles.ambientOverlay} />
        </div>
      ) : null}

      {/* Top Crisp Backdrop with bottom gradient transparency mask */}
      {backdropUrl ? (
        <div className={styles.backdropContainer}>
          <img src={backdropUrl} alt={item?.Name || "Backdrop"} className={styles.backdropImage} />
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
            canIdentify ? (
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
            ) : undefined
          }
        />
      </div>

      {/* Hero Bottom Layout */}
      <main className={styles.heroContent}>
        <div className={styles.row}>
          <div className={styles.leftColumn}>
            <div className={styles.logoWrapper}>
              {logoUrl ? (
                <img src={logoUrl} alt={item?.Name || "Logo"} className={styles.logoImage} onError={() => setLogoError(true)} />
              ) : (
                <h1 className={styles.titleFallback}>{item?.Name || "Media"}</h1>
              )}
            </div>
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.leftColumn}>
            <GlassElement
              variant="primary"
              size="lg"
              shape="rounded"
              fullWidth
              onClick={onPlay}
              disabled={isPlaying || (isSeries && !nextUpEpisode)}
              aria-label="Play"
              leftSection={<IconPlayerPlayFilled size={18} />}
            >
              <span>Play{resumeTimeClock ? ` ${resumeTimeClock}` : ""}</span>
            </GlassElement>
          </div>

          {/* Right Column: Rating, Genres, Technical Specs, Overview */}
          <div className={styles.rightColumn}>
            {/* Row 1: Star Rating, Official Rating, Genres */}
            <div className={styles.ratingGenresRow}>
              {rating ? (
                <span className={styles.starRating}>
                  <span className={styles.starIcon}>★</span>
                  <span>{rating}</span>
                </span>
              ) : null}

              {officialRating ? <span className={styles.officialRatingBadge}>{officialRating}</span> : null}

              {genresText ? <span className={styles.genres}>{genresText}</span> : null}

              {isSyncing && (
                <span className={styles.syncingBadge} title="Metadata is syncing with server...">
                  <span className={styles.syncDot} />
                  <span>Syncing with server</span>
                </span>
              )}
            </div>

            {/* Row 2: Duration, Release Date, Specs */}
            <div className={styles.specsRow}>
              {durationText ? <span className={styles.specBadge}>{durationText}</span> : null}
              {premiereDateText ? <span className={styles.specBadge}>{premiereDateText}</span> : null}
              {resolutionBadge ? <span className={styles.specBadge}>{resolutionBadge}</span> : null}
              {hdrBadge ? <span className={styles.specBadge}>{hdrBadge}</span> : null}
              {fpsBadge ? <span className={styles.specBadge}>{fpsBadge}</span> : null}
              {sizeBadge ? <span className={styles.specBadge}>{sizeBadge}</span> : null}
            </div>

            {/* Row 3: Overview with prefix */}
            {overviewText ? (
              <p className={styles.overview}>
                {overviewPrefix ? <strong className={styles.overviewPrefix}>{overviewPrefix} • </strong> : null}
                {overviewText}
              </p>
            ) : null}
          </div>
        </div>

        {/* Row 3: Full-width Cast & Crew Section */}
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
  const list = people.slice(0, 30);

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
                  <img src={avatarUrl} alt={p.Name || ""} className={styles.castAvatar} loading="lazy" />
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
