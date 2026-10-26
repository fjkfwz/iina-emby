import type { EmbyItemMetadata, RemoteSearchResult } from "@shared";
import { IconAlertCircle } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useDeferredValue, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams } from "react-router";
import { MediaPoster, MediaPosterSkeleton } from "../components/MediaPoster";
import { PageHeader } from "../components/PageHeader";
import { SectionToolbar } from "../components/SectionToolbar";
import { Alert } from "../components/ui";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useProgressiveScroll } from "../hooks/useProgressiveScroll";
import { fetchAllSectionData, fetchUserViews, type SectionAllData } from "../lib/emby-library-client";
import { useTranslation } from "../lib/i18n";
import { queryClient } from "../lib/query-client";
import { embyKeys } from "../lib/query-keys";
import { filterAndSortSectionItems, type SectionFilter, type SectionSortBy, type SectionSortOrder } from "../lib/section-items";
import { startViewTransitionSafe } from "../lib/view-transitions";
import styles from "./section.module.css";

const PAGE_SIZE = 36;

export function meta() {
  return [{ title: "Collection - IINA Emby" }, { name: "description", content: "Collection view" }];
}

export default function SectionRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const { activeServer, servers, isLoading: isBridgeLoading } = useIINABridge();

  const stateName = location.state?.name as string | undefined;
  const [filter, setFilter] = useState<SectionFilter>("all");
  const [genre, setGenre] = useState<string>("all");
  const [year, setYear] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [sortBy, setSortBy] = useState<SectionSortBy>("name");
  const [sortOrder, setSortOrder] = useState<SectionSortOrder>("asc");

  // Fetch view title if not provided in location state
  const viewsQuery = useQuery({
    queryKey: activeServer?.id ? embyKeys.userViews(activeServer.id) : ["empty-views"],
    queryFn: async ({ signal }) => {
      if (!activeServer) return [];
      return fetchUserViews(activeServer, signal);
    },
    enabled: Boolean(activeServer?.id && !stateName),
  });

  const sectionTitle = stateName || viewsQuery.data?.find((v) => v.Id === id)?.Name || "Library";

  // Fetch section data via TanStack Query (cached for fast transitions)
  const sectionQuery = useQuery({
    queryKey: activeServer?.id && id ? embyKeys.section(activeServer.id, id) : ["empty-section"],
    queryFn: async ({ signal }) => {
      if (!activeServer || !id) return null;
      return fetchAllSectionData(activeServer, id, signal, false);
    },
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(activeServer?.id && id),
  });

  const rawData = sectionQuery.data ?? null;
  const isLoading = sectionQuery.isLoading;
  const isRefreshing = sectionQuery.isRefetching;
  const error = sectionQuery.error ? (sectionQuery.error instanceof Error ? sectionQuery.error.message : String(sectionQuery.error)) : null;

  const handleRefresh = useCallback(() => {
    return sectionQuery.refetch();
  }, [sectionQuery]);

  useOnWindowReopen(() => {
    handleRefresh();
  });

  // When user identifies an item, immediately update item in section cache
  const handleIdentifySuccess = useCallback(
    (identifiedItem: EmbyItemMetadata, result?: RemoteSearchResult) => {
      console.log(`[Section:Identify] Identify completed for item ${identifiedItem.Id} with:`, result);
      if (!activeServer || !id) return;

      const pendingImage = result?.ImageUrl || result?.ThumbnailUrl;

      // Optimistic update of item in section cache
      queryClient.setQueryData<SectionAllData>(embyKeys.section(activeServer.id, id), (old) => {
        if (!old) return old;
        return {
          ...old,
          items: old.items.map((it) =>
            it.Id === identifiedItem.Id
              ? {
                  ...it,
                  Name: result?.Name || identifiedItem.Name,
                  ProductionYear: result?.ProductionYear ?? identifiedItem.ProductionYear,
                  PremiereDate: result?.PremiereDate ?? identifiedItem.PremiereDate,
                  Overview: result?.Overview ?? identifiedItem.Overview,
                  pendingImageUrl: pendingImage,
                  isIdentifying: true,
                }
              : it,
          ),
        };
      });

      // Also update single item query cache if it exists
      if (result) {
        queryClient.setQueryData<EmbyItemMetadata>(embyKeys.item(activeServer.id, identifiedItem.Id), (old) => {
          if (!old) return old;
          return {
            ...old,
            Name: result.Name || old.Name,
            ProductionYear: result.ProductionYear ?? old.ProductionYear,
            PremiereDate: result.PremiereDate ?? old.PremiereDate,
            Overview: result.Overview ?? old.Overview,
            pendingImageUrl: pendingImage,
            isIdentifying: true,
          };
        });
      }
    },
    [activeServer, id],
  );

  const handleFilterChange = (newFilter: SectionFilter) => {
    startViewTransitionSafe(() => {
      setFilter(newFilter);
    });
  };

  const handleGenreChange = (newGenre: string) => {
    startViewTransitionSafe(() => {
      setGenre(newGenre);
    });
  };

  const handleYearChange = (newYear: string) => {
    startViewTransitionSafe(() => {
      setYear(newYear);
    });
  };

  const handleSortByChange = (newSortBy: SectionSortBy) => {
    startViewTransitionSafe(() => {
      setSortBy(newSortBy);
      setSortOrder(newSortBy === "name" ? "asc" : "desc");
    });
  };

  const handleSortOrderChange = (newOrder: SectionSortOrder) => {
    startViewTransitionSafe(() => {
      setSortOrder(newOrder);
    });
  };

  const handleSearchQueryChange = (query: string) => {
    if (!query && searchQuery) {
      startViewTransitionSafe(() => {
        setSearchQuery("");
      });
    } else {
      setSearchQuery(query);
    }
  };

  // Derive unique genres and years from raw data for composite filtering
  const availableGenres = useMemo(() => {
    if (!rawData?.items) return [];
    const set = new Set<string>();
    for (const it of rawData.items) {
      if (Array.isArray(it.Genres)) {
        for (const g of it.Genres) {
          if (g && g.trim()) set.add(g.trim());
        }
      }
      if (Array.isArray(it.GenreItems)) {
        for (const g of it.GenreItems) {
          if (g?.Name && g.Name.trim()) set.add(g.Name.trim());
        }
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, "zh-CN"));
  }, [rawData?.items]);

  const availableYears = useMemo(() => {
    if (!rawData?.items) return [];
    const set = new Set<number>();
    for (const it of rawData.items) {
      const y = it.ProductionYear ?? (it.PremiereDate ? new Date(it.PremiereDate).getFullYear() : 0);
      if (y > 1900 && y < 2100) set.add(y);
    }
    return Array.from(set).sort((a, b) => b - a);
  }, [rawData?.items]);

  // Client-side composite filtering and sorting
  const filteredItems = useMemo(() => {
    if (!rawData) return [];
    return filterAndSortSectionItems(rawData.items, {
      filter,
      genre,
      year,
      searchQuery: deferredSearchQuery,
      sortBy,
      sortOrder,
      resumeSeriesIds: rawData.resumeSeriesIds,
      resumeItemIds: rawData.resumeItemIds,
    });
  }, [rawData, filter, genre, year, deferredSearchQuery, sortBy, sortOrder]);

  // Progressive rendering for DOM performance
  const { visibleItems, hasMore, sentinelRef } = useProgressiveScroll({
    items: filteredItems,
    pageSize: PAGE_SIZE,
  });

  if (isBridgeLoading) {
    return null;
  }

  if (servers.length === 0 || !activeServer) {
    return <Navigate to="/servers" replace />;
  }

  const handleBack = () => {
    navigate("/");
  };

  const totalCount = rawData?.items.length ?? 0;
  const filteredCount = filteredItems.length;

  const countBadgeText = totalCount === 0 ? null : filteredCount !== totalCount ? `(${filteredCount} / ${totalCount})` : `(${totalCount})`;

  const titleNode = (
    <span>
      {sectionTitle}
      {countBadgeText && <span className={styles.countBadge}>{countBadgeText}</span>}
    </span>
  );

  const getEmptyMessage = () => {
    const hasActiveFilters = searchQuery.trim() || genre !== "all" || year !== "all" || filter !== "all";
    if (hasActiveFilters) {
      return t("noResultsMatchFilters", "No results match your active filters");
    }
    return t("noItems", "No items available");
  };

  return (
    <div className={styles.container}>
      <PageHeader onBack={handleBack} backTitle={t("home", "Home")} title={titleNode} onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <main className={styles.content}>
        <SectionToolbar
          filter={filter}
          onFilterChange={handleFilterChange}
          genre={genre}
          onGenreChange={handleGenreChange}
          availableGenres={availableGenres}
          year={year}
          onYearChange={handleYearChange}
          availableYears={availableYears}
          searchQuery={searchQuery}
          onSearchQueryChange={handleSearchQueryChange}
          sortBy={sortBy}
          onSortByChange={handleSortByChange}
          sortOrder={sortOrder}
          onSortOrderChange={handleSortOrderChange}
        />

        {error && <Alert icon={<IconAlertCircle size={18} />}>{error}</Alert>}

        {isLoading ? (
          <div className={styles.grid}>
            {Array.from({ length: 18 }).map((_, index) => (
              <MediaPosterSkeleton key={`skeleton-${index}`} />
            ))}
          </div>
        ) : filteredItems.length === 0 && !error ? (
          <div className={styles.emptyState}>
            <p>{getEmptyMessage()}</p>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {visibleItems.map((item) => (
                <MediaPoster key={item.Id} item={item} server={activeServer} onIdentifySuccess={handleIdentifySuccess} />
              ))}
            </div>

            {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
          </>
        )}
      </main>
    </div>
  );
}
