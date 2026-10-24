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
  const { activeServer, servers, isLoading: isBridgeLoading } = useIINABridge();

  const stateName = location.state?.name as string | undefined;
  const [filter, setFilter] = useState<SectionFilter>("all");
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

  // Client-side filtering and sorting
  const filteredItems = useMemo(() => {
    if (!rawData) return [];
    return filterAndSortSectionItems(rawData.items, {
      filter,
      searchQuery: deferredSearchQuery,
      sortBy,
      sortOrder,
      resumeSeriesIds: rawData.resumeSeriesIds,
      resumeItemIds: rawData.resumeItemIds,
    });
  }, [rawData, filter, deferredSearchQuery, sortBy, sortOrder]);

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
    if (searchQuery.trim()) {
      return `No media found matching "${searchQuery.trim()}".`;
    }
    switch (filter) {
      case "unplayed":
        return "No unplayed media in this collection.";
      case "inprogress":
        return "No in-progress media in this collection.";
      case "played":
        return "No played media in this collection.";
      default:
        return "No media found in this collection.";
    }
  };

  return (
    <div className={styles.container}>
      <PageHeader onBack={handleBack} backTitle="Home" title={titleNode} onRefresh={handleRefresh} isRefreshing={isRefreshing} />

      <main className={styles.content}>
        <SectionToolbar
          filter={filter}
          onFilterChange={handleFilterChange}
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
