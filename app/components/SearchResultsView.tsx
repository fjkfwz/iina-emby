import type { EmbyItemMetadata, EmbyServer, RemoteSearchResult } from "@shared";
import { IconAlertCircle, IconRotateClockwise, IconSearch, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useState } from "react";
import { MediaPoster, MediaPosterSkeleton } from "./MediaPoster";
import { Alert } from "./ui";
import { Select, type SelectOption } from "./ui/Select";
import { buildAuthHeaders } from "../lib/emby-auth-client";
import styles from "./SearchResultsView.module.css";

export type MediaTypeFilter = "all" | "movies" | "series";

export interface SearchResultsViewProps {
  server: EmbyServer;
  query: string;
  onIdentifySuccess?: (item: EmbyItemMetadata, result?: RemoteSearchResult) => void;
}

export function SearchResultsView({
  server,
  query,
  onIdentifySuccess,
}: SearchResultsViewProps) {
  const [mediaType, setMediaType] = useState<MediaTypeFilter>("all");
  const [genre, setGenre] = useState<string>("all");
  const [year, setYear] = useState<string>("all");

  const [results, setResults] = useState<EmbyItemMetadata[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const cleanQuery = query.trim();

  // Fetch search results from Emby server whenever query or mediaType changes
  useEffect(() => {
    if (!server || !cleanQuery) {
      setResults([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    let isCancelled = false;
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);

    const types = mediaType === "movies" ? "Movie" : mediaType === "series" ? "Series" : "Movie,Series,BoxSet";
    const baseUrl = server.serverUrl.replace(/\/+$/, "");
    const params = new URLSearchParams({
      Recursive: "true",
      SortBy: "SortName",
      SortOrder: "Ascending",
      StartIndex: "0",
      Limit: "200",
      IncludeItemTypes: types,
      Fields:
        "CommunityRating,ProductionYear,Genres,GenreItems,ImageTags,BackdropImageTags,UserData,PrimaryImageAspectRatio,SeriesName,RunTimeTicks,Overview,RecursiveItemCount,ItemCounts,DateCreated,PremiereDate,OriginalTitle,ProviderIds",
      EnableImageTypes: "Primary,Backdrop,Thumb",
      ImageTypeLimit: "1",
      SearchTerm: cleanQuery,
    });

    const url = `${baseUrl}/Users/${encodeURIComponent(server.userId)}/Items?${params.toString()}`;

    fetch(url, {
      signal: controller.signal,
      headers: buildAuthHeaders(server.accessToken, { Accept: "application/json" }),
    })
      .then((res) => {
        if (!res.ok) throw new Error(`Search request failed (${res.status} ${res.statusText})`);
        return res.json();
      })
      .then((data: { Items?: EmbyItemMetadata[] }) => {
        if (!isCancelled) {
          setResults(data.Items || []);
          setIsLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (!isCancelled && !(err instanceof Error && err.name === "AbortError")) {
          setError(err instanceof Error ? err.message : String(err));
          setIsLoading(false);
        }
      });

    return () => {
      isCancelled = true;
      controller.abort();
    };
  }, [server, cleanQuery, mediaType]);

  // Extract available genres from current results with counts
  const genreOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of results) {
      if (Array.isArray(item.Genres)) {
        for (const g of item.Genres) {
          if (g && g.trim()) {
            const name = g.trim();
            counts[name] = (counts[name] || 0) + 1;
          }
        }
      }
      if (Array.isArray(item.GenreItems)) {
        for (const gi of item.GenreItems) {
          if (gi?.Name && gi.Name.trim()) {
            const name = gi.Name.trim();
            counts[name] = (counts[name] || 0) + 1;
          }
        }
      }
    }

    const sortedNames = Object.keys(counts).sort((a, b) => a.localeCompare(b, "zh-CN"));
    const options: SelectOption[] = [
      { value: "all", label: results.length > 0 ? `All Genres (${results.length})` : "All Genres" },
      ...sortedNames.map((name) => ({
        value: name,
        label: `${name} (${counts[name]})`,
      })),
    ];

    return options;
  }, [results]);

  // Extract available years from current results with counts
  const yearOptions = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const item of results) {
      const y = item.ProductionYear ?? (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : 0);
      if (y > 1900 && y < 2100) {
        counts[y] = (counts[y] || 0) + 1;
      }
    }

    const sortedYears = Object.keys(counts)
      .map(Number)
      .sort((a, b) => b - a);

    const options: SelectOption[] = [
      { value: "all", label: results.length > 0 ? `All Years (${results.length})` : "All Years" },
      ...sortedYears.map((y) => ({
        value: String(y),
        label: `${y} (${counts[y]})`,
      })),
    ];

    return options;
  }, [results]);

  // Apply composite filter (Genre + Year) in-memory across the search results
  const filteredResults = useMemo(() => {
    return results.filter((item) => {
      // 1. Genre filter
      if (genre !== "all") {
        const hasGenre =
          (Array.isArray(item.Genres) && item.Genres.includes(genre)) ||
          (Array.isArray(item.GenreItems) && item.GenreItems.some((g) => g.Name === genre));
        if (!hasGenre) return false;
      }

      // 2. Year filter
      if (year !== "all") {
        const itemYear = item.ProductionYear ?? (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : 0);
        if (year === "earlier") {
          if (itemYear <= 0 || itemYear >= 1990) return false;
        } else if (year.endsWith("s")) {
          const decade = parseInt(year, 10);
          if (itemYear < decade || itemYear >= decade + 10) return false;
        } else {
          const targetYear = parseInt(year, 10);
          if (itemYear !== targetYear) return false;
        }
      }

      return true;
    });
  }, [results, genre, year]);

  const hasActiveFilters = genre !== "all" || year !== "all" || mediaType !== "all";

  const handleResetFilters = () => {
    setMediaType("all");
    setGenre("all");
    setYear("all");
  };

  return (
    <div className={styles.container}>
      <div className={styles.searchHeaderContainer}>
        {/* Filter Controls */}
        <div className={styles.filterRow}>
          {/* Media Type Tabs */}
          <div className={styles.filterTabs}>
            <button
              type="button"
              className={`${styles.filterTab} ${mediaType === "all" ? styles.filterTabActive : ""}`}
              onClick={() => setMediaType("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${mediaType === "movies" ? styles.filterTabActive : ""}`}
              onClick={() => setMediaType("movies")}
            >
              Movies
            </button>
            <button
              type="button"
              className={`${styles.filterTab} ${mediaType === "series" ? styles.filterTabActive : ""}`}
              onClick={() => setMediaType("series")}
            >
              Series
            </button>
          </div>

          {/* Genre and Year Dropdowns */}
          <div className={styles.dropdownGroup}>
            {genreOptions.length > 1 && (
              <div className={styles.dropdownWrapper}>
                <Select
                  data={genreOptions}
                  value={genre}
                  onChange={(val) => setGenre(val || "all")}
                  size="sm"
                  placement="bottom-start"
                />
              </div>
            )}

            {yearOptions.length > 1 && (
              <div className={styles.dropdownWrapper}>
                <Select
                  data={yearOptions}
                  value={year}
                  onChange={(val) => setYear(val || "all")}
                  size="sm"
                  placement="bottom-start"
                />
              </div>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                className={styles.resetBtn}
                onClick={handleResetFilters}
                title="Reset all filters"
              >
                <IconRotateClockwise size={12} style={{ marginRight: "4px" }} />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className={styles.activeChipsRow}>
            {mediaType !== "all" && (
              <span className={styles.filterChip} onClick={() => setMediaType("all")}>
                <span>Type: {mediaType === "movies" ? "Movies" : "Series"}</span>
                <IconX size={12} className={styles.filterChipClose} />
              </span>
            )}
            {genre !== "all" && (
              <span className={styles.filterChip} onClick={() => setGenre("all")}>
                <span>Genre: {genre}</span>
                <IconX size={12} className={styles.filterChipClose} />
              </span>
            )}
            {year !== "all" && (
              <span className={styles.filterChip} onClick={() => setYear("all")}>
                <span>Year: {year}</span>
                <IconX size={12} className={styles.filterChipClose} />
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <Alert icon={<IconAlertCircle size={18} />} title="Search Error" mb="md" mx="1.5rem">
          {error}
        </Alert>
      )}

      {isLoading ? (
        <div className={styles.grid}>
          {Array.from({ length: 12 }).map((_, index) => (
            <MediaPosterSkeleton key={`skeleton-${index}`} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className={styles.emptyState}>
          <IconSearch size={48} className={styles.emptyIcon} stroke={1.5} />
          <div className={styles.emptyTitle}>
            {cleanQuery ? `No results found for "${cleanQuery}"` : "No items found"}
          </div>
          <div className={styles.emptyDesc}>
            Try checking your spelling or searching for another title.
          </div>
        </div>
      ) : filteredResults.length === 0 ? (
        <div className={styles.emptyState}>
          <IconSearch size={48} className={styles.emptyIcon} stroke={1.5} />
          <div className={styles.emptyTitle}>No results match your active filters</div>
          <div className={styles.emptyDesc} style={{ marginBottom: "1rem" }}>
            {results.length} item(s) matched "{cleanQuery}", but none passed the selected genre or year filter.
          </div>
          <button
            type="button"
            className={styles.resetBtn}
            onClick={handleResetFilters}
            style={{ fontSize: "0.8125rem", padding: "6px 12px" }}
          >
            <IconRotateClockwise size={14} style={{ marginRight: "6px" }} />
            <span>Reset Filters</span>
          </button>
        </div>
      ) : (
        <>
          <div className={styles.resultsSummary}>
            <span>
              Found <strong>{filteredResults.length}</strong>
              {filteredResults.length !== results.length && ` (filtered from ${results.length})`} result
              {filteredResults.length > 1 ? "s" : ""} for "<strong>{cleanQuery}</strong>"
            </span>
          </div>

          <div className={styles.grid}>
            {filteredResults.map((item) => (
              <MediaPoster
                key={item.Id}
                item={item}
                server={server}
                onIdentifySuccess={onIdentifySuccess}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
