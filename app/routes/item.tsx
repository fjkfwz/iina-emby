import { type EmbyItemMetadata, formatFullEpisodeTitle, formatSubtitleDisplayLabel } from "@shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router";
import { EpisodeDetailModal } from "../components/EpisodeDetailModal";
import { ItemHero } from "../components/ItemHero";
import { ItemMediaInfo } from "../components/ItemMediaInfo";
import { SeriesEpisodesShelf } from "../components/SeriesEpisodesShelf";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useSeriesEpisodes } from "../hooks/useSeriesEpisodes";
import { useTranslation } from "../lib/i18n";
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
  const queryClient = useQueryClient();
  const { activeServer, playMedia, preferences } = useIINABridge();
  const { t } = useTranslation();

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
      return fetchItemDetails(activeServer, id, signal, false);
    },
    placeholderData: stateItem,
    staleTime: 60 * 1000,
    refetchOnMount: false,
    enabled: Boolean(activeServer?.id && id),
  });

  const item = itemQuery.data ?? stateItem;
  // Show the refresh indicator only for refetches of real data, not while replacing the placeholder.
  const isRefreshing = itemQuery.isRefetching && !itemQuery.isPlaceholderData;

  const handleRefresh = useCallback(() => {
    if (!activeServer || !id) return Promise.resolve(null);
    return fetchItemDetails(activeServer, id, undefined, true).then((fresh) => {
      queryClient.setQueryData(embyKeys.item(activeServer.id, id), fresh);
      return fresh;
    });
  }, [activeServer, id]);

  useOnWindowReopen(() => {
    handleRefresh();
  });

  // Series next-up, seasons, and episodes management
  const { isSeries, nextUpEpisode, seasons, selectedSeasonId, setSelectedSeasonId, episodes, isEpisodesLoading } = useSeriesEpisodes(
    activeServer,
    item,
  );

  const [selectedAudioIndex, setSelectedAudioIndex] = useState<number | undefined>(undefined);
  const [selectedSubtitleIndex, setSelectedSubtitleIndex] = useState<number | undefined>(undefined);

  if (!activeServer) {
    return null;
  }

  const playTarget = isSeries ? nextUpEpisode || episodes[0] : item;

  const mediaStreams =
    (playTarget || item)?.MediaStreams || (playTarget || item)?.MediaSources?.[0]?.MediaStreams || [];
  const audioStreams = Array.isArray(mediaStreams) ? mediaStreams.filter((s) => s.Type === "Audio") : [];
  const subtitleStreams = Array.isArray(mediaStreams) ? mediaStreams.filter((s) => s.Type === "Subtitle") : [];

  const rememberedTracks = useMemo(() => {
    const raw = preferences?.emby_track_preferences;
    if (!raw) return {};
    if (typeof raw === "string") {
      try {
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    if (typeof raw === "object") return raw as Record<string, any>;
    return {};
  }, [preferences?.emby_track_preferences]);

  const targetSaved = playTarget?.Id ? rememberedTracks[playTarget.Id] : undefined;

  const defaultAudioIdx = (playTarget || item)?.MediaSources?.[0]?.DefaultAudioStreamIndex;
  const defaultSubIdx = (playTarget || item)?.MediaSources?.[0]?.DefaultSubtitleStreamIndex;

  const effectiveAudioIndex =
    selectedAudioIndex !== undefined
      ? selectedAudioIndex
      : typeof targetSaved?.audioStreamIndex === "number" &&
        audioStreams.some((s) => s.Index === targetSaved.audioStreamIndex)
        ? targetSaved.audioStreamIndex
        : typeof defaultAudioIdx === "number" && audioStreams.some((s) => s.Index === defaultAudioIdx)
          ? defaultAudioIdx
          : (audioStreams.find((s) => s.IsDefault) || audioStreams[0])?.Index;

  const effectiveSubtitleIndex =
    selectedSubtitleIndex !== undefined
      ? selectedSubtitleIndex
      : targetSaved?.subtitleStreamIndex === -1 || targetSaved?.subtitleLanguage === "off"
        ? -1
        : typeof targetSaved?.subtitleStreamIndex === "number" &&
          subtitleStreams.some((s) => s.Index === targetSaved.subtitleStreamIndex)
          ? targetSaved.subtitleStreamIndex
          : typeof defaultSubIdx === "number" &&
              (defaultSubIdx === -1 || subtitleStreams.some((s) => s.Index === defaultSubIdx))
            ? defaultSubIdx
            : (subtitleStreams.find((s) => s.IsDefault) || subtitleStreams[0])?.Index;

  const selectedAudioStream = audioStreams.find((s) => s.Index === effectiveAudioIndex);
  const selectedSubtitleStream = subtitleStreams.find((s) => s.Index === effectiveSubtitleIndex);

  const audioStreamIndex = audioStreams.findIndex((s) => s.Index === effectiveAudioIndex);
  const audioTrackNumber = audioStreamIndex !== -1 ? audioStreamIndex + 1 : undefined;

  const subStreamIndex = subtitleStreams.findIndex((s) => s.Index === effectiveSubtitleIndex);
  const subtitleTrackNumber = subStreamIndex !== -1 ? subStreamIndex + 1 : undefined;

  const selectedAudioLabel = selectedAudioStream
    ? `${selectedAudioStream.DisplayLanguage || selectedAudioStream.Language || "Audio"}${selectedAudioStream.ChannelLayout ? ` • ${selectedAudioStream.ChannelLayout}` : ""}`
    : undefined;

  const selectedSubtitleLabel =
    effectiveSubtitleIndex === -1
      ? t("subtitlesOff", "Subtitles Off")
      : selectedSubtitleStream
        ? formatSubtitleDisplayLabel(selectedSubtitleStream)
        : undefined;

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

      const mediaSourceId = (playTarget || item)?.MediaSources?.[0]?.Id;

      playMedia({
        title: playTitle,
        streamUrl: buildStreamUrl(activeServer, playTarget.Id),
        startPositionTicks: playTarget.UserData?.PlaybackPositionTicks,
        selectedAudioIndex: selectedAudioIndex !== undefined ? selectedAudioIndex : undefined,
        selectedSubtitleIndex: selectedSubtitleIndex !== undefined ? selectedSubtitleIndex : undefined,
        audioTrackNumber: selectedAudioIndex !== undefined ? audioTrackNumber : undefined,
        subtitleTrackNumber: selectedSubtitleIndex !== undefined ? subtitleTrackNumber : undefined,
        audioLanguage: selectedAudioIndex !== undefined ? selectedAudioStream?.Language : undefined,
        subtitleLanguage: selectedSubtitleIndex !== undefined ? selectedSubtitleStream?.Language : undefined,
        isExternalSubtitle: selectedSubtitleIndex !== undefined ? selectedSubtitleStream?.IsExternal : undefined,
        subtitlePath: selectedSubtitleIndex !== undefined ? selectedSubtitleStream?.Path : undefined,
        subtitleCodec: selectedSubtitleIndex !== undefined ? selectedSubtitleStream?.Codec : undefined,
        mediaSourceId,
        subtitleDeliveryUrl: selectedSubtitleIndex !== undefined ? selectedSubtitleStream?.DeliveryUrl : undefined,
        subtitleTitle:
          selectedSubtitleIndex !== undefined
            ? selectedSubtitleStream?.DisplayTitle || selectedSubtitleStream?.Title || selectedSubtitleStream?.DisplayLanguage
            : undefined,
      });
    } finally {
      setIsPlaying(false);
    }
  };

  // Episode card playback execution
  const handlePlayEpisode = (ep: EmbyItemMetadata) => {
    const playTitle = formatFullEpisodeTitle(item?.Name, ep.ParentIndexNumber, ep.IndexNumber, ep.Name);

    const epStreams = ep.MediaStreams || ep.MediaSources?.[0]?.MediaStreams;
    let epAudioIndex = effectiveAudioIndex;
    let epSubIndex = effectiveSubtitleIndex;
    let epAudioTrackNum = audioTrackNumber;
    let epSubTrackNum = subtitleTrackNumber;
    let epSubExt = selectedSubtitleStream?.IsExternal;
    let epSubPath = selectedSubtitleStream?.Path;
    let epSubCodec = selectedSubtitleStream?.Codec;
    let epSubDeliveryUrl = selectedSubtitleStream?.DeliveryUrl;
    let epSubTitle = selectedSubtitleStream?.DisplayTitle || selectedSubtitleStream?.Title || selectedSubtitleStream?.DisplayLanguage;
    const epMediaSourceId = ep.MediaSources?.[0]?.Id || (playTarget || item)?.MediaSources?.[0]?.Id;

    const isCurrentPlayTarget = Boolean(playTarget?.Id && String(ep.Id) === String(playTarget.Id));

    if (!isCurrentPlayTarget && Array.isArray(epStreams) && epStreams.length > 0) {
      const epAudioStreams = epStreams.filter((s) => s.Type === "Audio");
      const epSubStreams = epStreams.filter((s) => s.Type === "Subtitle");

      if (selectedAudioStream) {
        const match =
          epAudioStreams.find(
            (s) =>
              s.Language?.toLowerCase() === selectedAudioStream.Language?.toLowerCase() &&
              s.Codec?.toLowerCase() === selectedAudioStream.Codec?.toLowerCase(),
          ) ||
          (typeof audioTrackNumber === "number" && epAudioStreams[audioTrackNumber - 1]) ||
          epAudioStreams.find((s) => s.Language?.toLowerCase() === selectedAudioStream.Language?.toLowerCase());

        if (match) {
          epAudioIndex = match.Index;
          epAudioTrackNum = epAudioStreams.indexOf(match) + 1;
        }
      }

      if (effectiveSubtitleIndex === -1) {
        epSubIndex = -1;
        epSubTrackNum = undefined;
        epSubExt = false;
        epSubDeliveryUrl = undefined;
      } else if (selectedSubtitleStream) {
        const match =
          epSubStreams.find(
            (s) =>
              s.Language?.toLowerCase() === selectedSubtitleStream.Language?.toLowerCase() &&
              s.Codec?.toLowerCase() === selectedSubtitleStream.Codec?.toLowerCase(),
          ) ||
          (typeof subtitleTrackNumber === "number" && epSubStreams[subtitleTrackNumber - 1]) ||
          epSubStreams.find((s) => s.Language?.toLowerCase() === selectedSubtitleStream.Language?.toLowerCase());

        if (match) {
          epSubIndex = match.Index;
          epSubTrackNum = epSubStreams.indexOf(match) + 1;
          epSubExt = match.IsExternal;
          epSubPath = match.Path;
          epSubCodec = match.Codec;
          epSubDeliveryUrl = match.DeliveryUrl;
          epSubTitle = match.DisplayTitle || match.Title || match.DisplayLanguage || epSubTitle;
        }
      }
    }

    const hasExplicitAudioSelection = selectedAudioIndex !== undefined;
    const hasExplicitSubSelection = selectedSubtitleIndex !== undefined;

    playMedia({
      title: playTitle,
      streamUrl: buildStreamUrl(activeServer, ep.Id),
      startPositionTicks: ep.UserData?.PlaybackPositionTicks,
      selectedAudioIndex: hasExplicitAudioSelection ? epAudioIndex : undefined,
      selectedSubtitleIndex: hasExplicitSubSelection ? epSubIndex : undefined,
      audioTrackNumber: hasExplicitAudioSelection ? epAudioTrackNum : undefined,
      subtitleTrackNumber: hasExplicitSubSelection ? epSubTrackNum : undefined,
      audioLanguage: hasExplicitAudioSelection ? selectedAudioStream?.Language : undefined,
      subtitleLanguage: hasExplicitSubSelection ? selectedSubtitleStream?.Language : undefined,
      isExternalSubtitle: hasExplicitSubSelection ? epSubExt : undefined,
      subtitlePath: hasExplicitSubSelection ? epSubPath : undefined,
      subtitleCodec: hasExplicitSubSelection ? epSubCodec : undefined,
      mediaSourceId: epMediaSourceId,
      subtitleDeliveryUrl: hasExplicitSubSelection ? epSubDeliveryUrl : undefined,
      subtitleTitle: hasExplicitSubSelection ? epSubTitle : undefined,
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
        selectedAudioLabel={selectedAudioLabel}
        selectedSubtitleLabel={selectedSubtitleLabel}
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

      <ItemMediaInfo
        item={playTarget || item}
        selectedAudioIndex={effectiveAudioIndex}
        onSelectAudioIndex={setSelectedAudioIndex}
        selectedSubtitleIndex={effectiveSubtitleIndex}
        onSelectSubtitleIndex={setSelectedSubtitleIndex}
      />

      <EpisodeDetailModal episode={detailEpisode} onClose={() => setDetailEpisode(null)} onPlay={handlePlayEpisode} />
    </div>
  );
}
