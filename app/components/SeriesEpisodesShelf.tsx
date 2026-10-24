import { type EmbyItemMetadata, type EmbyServer, formatEpisodeSubtitle } from "@shared";
import { memo } from "react";
import { MediaShelf } from "./MediaShelf";
import { MediaThumb, MediaThumbSkeleton } from "./MediaThumb";
import styles from "./SeriesEpisodesShelf.module.css";
import { Select } from "./ui/Select";

export interface SeriesEpisodesShelfProps {
  activeServer: EmbyServer;
  seasons: EmbyItemMetadata[];
  selectedSeasonId: string | null;
  onSelectSeason: (seasonId: string) => void;
  episodes: EmbyItemMetadata[];
  isLoading: boolean;
  onPlayEpisode: (episode: EmbyItemMetadata) => void;
  onEpisodeClick: (episode: EmbyItemMetadata) => void;
}

export const SeriesEpisodesShelf = memo(function SeriesEpisodesShelf({
  activeServer,
  seasons,
  selectedSeasonId,
  onSelectSeason,
  episodes,
  isLoading,
  onPlayEpisode,
  onEpisodeClick,
}: SeriesEpisodesShelfProps) {
  const seasonOptions = seasons.map((s) => ({
    value: s.Id,
    label: s.Name || `Season ${s.IndexNumber ?? 1}`,
  }));

  return (
    <section className={styles.seriesSection}>
      <MediaShelf
        key={selectedSeasonId || "default"}
        title={
          <div className={styles.shelfHeader}>
            <h3 className={styles.shelfTitle}>Episodes</h3>
            {seasons.length > 0 && (
              <Select
                data={seasonOptions}
                value={selectedSeasonId}
                onChange={(val) => {
                  if (val) onSelectSeason(val);
                }}
                allowDeselect={false}
                className={styles.seasonSelect}
              />
            )}
          </div>
        }
        itemWidth={300}
        gap={16}
        emptyText={!isLoading ? "No episodes available for this season." : undefined}
      >
        {isLoading && episodes.length === 0
          ? [1, 2, 3, 4, 5].map((id) => <MediaThumbSkeleton key={id} />)
          : episodes.map((ep) => {
              const cardTitle = formatEpisodeSubtitle(ep.ParentIndexNumber, ep.IndexNumber, ep.Name || "Episode");
              return (
                <MediaThumb
                  key={ep.Id}
                  item={ep}
                  server={activeServer}
                  title={cardTitle}
                  subtitle={ep.Overview || undefined}
                  subtitleLines={3}
                  onPlay={() => onPlayEpisode(ep)}
                  onClick={() => onPlayEpisode(ep)}
                />
              );
            })}
      </MediaShelf>
    </section>
  );
});
