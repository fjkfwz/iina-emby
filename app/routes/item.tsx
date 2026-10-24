import { type EmbyItemMetadata, formatFullEpisodeTitle } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { EpisodeDetailModal } from "../components/EpisodeDetailModal";
import { ItemHero } from "../components/ItemHero";
import { SeriesEpisodesShelf } from "../components/SeriesEpisodesShelf";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useSeriesEpisodes } from "../hooks/useSeriesEpisodes";
import { buildStreamUrl, fetchItemDetails } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";
import styles from "./item.module.css";

export function meta() {
  return [{ title: "Details - IINA Emby" }];
}

export default function ItemDetailRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { activeServer, playMedia } = useIINABridge();

  const stateItem = location.state?.item as EmbyItemMetadata | undefined;
  const [isPlaying, setIsPlaying] = useState(false);
  const [detailEpisode, setDetailEpisode] = useState<EmbyItemMetadata | null>(null);

  // Item details. The list item from the route transition is only a placeholder: list queries
  // request a reduced field set (no logo, ratings, sometimes no overview), so it must never be
  // cached as the full item.
  const itemQuery = useQuery({
    queryKey: activeServer?.id && id ? embyKeys.item(activeServer.id, id) : ["empty-item"],
    queryFn: async ({ signal }) => {
      if (!activeServer || !id) return null;
      return fetchItemDetails(activeServer, id, signal, true);
    },
    placeholderData: stateItem,
    staleTime: 0,
    refetchOnMount: true,
    enabled: Boolean(activeServer?.id && id),
  });

  const item = itemQuery.data ?? stateItem;
  // Show the refresh indicator only for refetches of real data, not while replacing the placeholder.
  const isRefreshing = itemQuery.isRefetching && !itemQuery.isPlaceholderData;

  const handleRefresh = useCallback(() => {
    return itemQuery.refetch();
  }, [itemQuery]);

  useOnWindowReopen(() => {
    handleRefresh();
  });

  // Series next-up, seasons, and episodes management
  const { isSeries, nextUpEpisode, seasons, selectedSeasonId, setSelectedSeasonId, episodes, isEpisodesLoading } = useSeriesEpisodes(
    activeServer,
    item,
  );

  if (!activeServer) {
    return null;
  }

  const playTarget = isSeries ? nextUpEpisode || episodes[0] : item;

  // Main hero playback execution
  const handlePlay = () => {
    if (!playTarget || isPlaying) return;

    // Safety guard: NEVER try to stream a Series container directly
    if (playTarget.Type === "Series") {
      console.warn("Cannot stream a Series container directly without an episode");
      return;
    }

    try {
      setIsPlaying(true);

      let playTitle = playTarget.Name || "Media";
      if (item?.Type === "Series") {
        playTitle = formatFullEpisodeTitle(item.Name, playTarget.ParentIndexNumber ?? 1, playTarget.IndexNumber, playTarget.Name);
      }

      playMedia({
        title: playTitle,
        streamUrl: buildStreamUrl(activeServer, playTarget.Id),
        startPositionTicks: playTarget.UserData?.PlaybackPositionTicks,
      });
    } finally {
      setIsPlaying(false);
    }
  };

  // Episode card playback execution
  const handlePlayEpisode = (ep: EmbyItemMetadata) => {
    const playTitle = formatFullEpisodeTitle(item?.Name, ep.ParentIndexNumber, ep.IndexNumber, ep.Name);

    playMedia({
      title: playTitle,
      streamUrl: buildStreamUrl(activeServer, ep.Id),
      startPositionTicks: ep.UserData?.PlaybackPositionTicks,
    });
  };

  return (
    <div className={styles.container}>
      <ItemHero
        item={item}
        nextUpEpisode={nextUpEpisode}
        activeServer={activeServer}
        isPlaying={isPlaying}
        onPlay={handlePlay}
        onBack={() => navigate(-1)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {isSeries && (
        <SeriesEpisodesShelf
          activeServer={activeServer}
          seasons={seasons}
          selectedSeasonId={selectedSeasonId}
          onSelectSeason={(seasonId) => setSelectedSeasonId(seasonId)}
          episodes={episodes}
          isLoading={isEpisodesLoading}
          onPlayEpisode={handlePlayEpisode}
          onEpisodeClick={setDetailEpisode}
        />
      )}

      <EpisodeDetailModal episode={detailEpisode} onClose={() => setDetailEpisode(null)} />
    </div>
  );
}
