import type { EmbyItemMetadata, EmbyServer } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchEpisodes, fetchNextUp, fetchSeasons } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export interface UseSeriesEpisodesResult {
  isSeries: boolean;
  nextUpEpisode: EmbyItemMetadata | null;
  seasons: EmbyItemMetadata[];
  selectedSeasonId: string | null;
  setSelectedSeasonId: React.Dispatch<React.SetStateAction<string | null>>;
  episodes: EmbyItemMetadata[];
  isEpisodesLoading: boolean;
}

export function useSeriesEpisodes(activeServer: EmbyServer | null, item?: EmbyItemMetadata): UseSeriesEpisodesResult {
  const isSeries = item?.Type === "Series";
  const [selectedSeasonIdState, setSelectedSeasonId] = useState<string | null>(null);

  // Reset season selection when viewing a different item
  useEffect(() => {
    setSelectedSeasonId(null);
  }, [item?.Id]);

  // 1. Fetch next-up episode if item is a series
  const nextUpQuery = useQuery({
    queryKey: activeServer && item?.Id ? embyKeys.nextUp(activeServer.id, item.Id) : ["emby", "noop"],
    enabled: Boolean(activeServer && isSeries && item?.Id),
    queryFn: async ({ signal }) => {
      if (!activeServer || !item?.Id) return null;
      const ep = await fetchNextUp(activeServer, item.Id, signal);
      if (ep) return ep;
      try {
        const [firstEp] = await fetchEpisodes(activeServer, item.Id, undefined, signal, false, 1);
        return firstEp ?? null;
      } catch {
        return null;
      }
    },
    staleTime: 5 * 60 * 1000,
  });

  // 2. Fetch seasons for series
  const seasonsQuery = useQuery({
    queryKey: activeServer && item?.Id ? embyKeys.seasons(activeServer.id, item.Id) : ["emby", "noop"],
    enabled: Boolean(activeServer && isSeries && item?.Id),
    queryFn: ({ signal }) => {
      if (!activeServer || !item?.Id) return [];
      return fetchSeasons(activeServer, item.Id, signal);
    },
    staleTime: 5 * 60 * 1000,
  });

  const seasons = isSeries ? (seasonsQuery.data ?? []) : [];
  const nextUpEpisode = isSeries ? (nextUpQuery.data ?? null) : null;

  // Determine active season ID
  const selectedSeasonId = useMemo(() => {
    if (!isSeries || seasons.length === 0) return null;
    if (selectedSeasonIdState && seasons.some((s) => String(s.Id) === String(selectedSeasonIdState))) {
      return selectedSeasonIdState;
    }
    if (nextUpEpisode?.SeasonId && seasons.some((s) => String(s.Id) === String(nextUpEpisode.SeasonId))) {
      return nextUpEpisode.SeasonId;
    }
    // Prefer Season 1 (IndexNumber === 1) over Specials (IndexNumber === 0)
    const season1 = seasons.find((s) => s.IndexNumber === 1);
    return (season1 || seasons[0]).Id;
  }, [isSeries, seasons, selectedSeasonIdState, nextUpEpisode?.SeasonId]);

  // 3. Fetch episodes when selected season changes
  const episodesQuery = useQuery({
    queryKey:
      activeServer && item?.Id && selectedSeasonId ? embyKeys.seriesEpisodes(activeServer.id, item.Id, selectedSeasonId) : ["emby", "noop"],
    enabled: Boolean(activeServer && isSeries && item?.Id && selectedSeasonId),
    queryFn: ({ signal }) => {
      if (!activeServer || !item?.Id || !selectedSeasonId) return [];
      return fetchEpisodes(activeServer, item.Id, selectedSeasonId, signal);
    },
    staleTime: 5 * 60 * 1000,
  });

  const episodes = isSeries && selectedSeasonId ? (episodesQuery.data ?? []) : [];
  const isEpisodesLoading = isSeries && (episodesQuery.isLoading || (seasonsQuery.isLoading && seasons.length === 0));

  // If nextUpEpisode is not resolved yet, fall back to first unplayed episode from loaded episodes
  const effectiveNextUp =
    nextUpEpisode || (isSeries && episodes.length > 0 ? episodes.find((e) => !e.UserData?.Played) || episodes[0] : null);

  return {
    isSeries,
    nextUpEpisode: effectiveNextUp,
    seasons,
    selectedSeasonId,
    setSelectedSeasonId,
    episodes,
    isEpisodesLoading,
  };
}
