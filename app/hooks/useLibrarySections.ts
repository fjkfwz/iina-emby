import type { EmbyItemMetadata, EmbyServer, EmbyView } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { fetchLatestItems, fetchUserViews } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export interface LibrarySectionData {
  view: EmbyView;
  items: EmbyItemMetadata[];
  isLoading?: boolean;
}

export function useLibrarySections(server: EmbyServer | null) {
  const isEnabled = Boolean(server?.userId && server?.serverUrl);

  const query = useQuery({
    queryKey: server?.id ? embyKeys.librarySections(server.id) : ["empty-library-sections"],
    queryFn: async ({ signal }): Promise<LibrarySectionData[]> => {
      if (!server) return [];
      const views = await fetchUserViews(server, signal);
      const videoViews = views.filter(
        (v) => !v.CollectionType || ["movies", "tvshows", "homevideos", "boxsets"].includes(v.CollectionType),
      );

      // Fetch library shelves in parallel to load all libraries rapidly
      const sectionResults = await Promise.all(
        videoViews.map(async (view) => {
          try {
            const items = await fetchLatestItems(server, view.Id, 16, signal);
            return { view, items, isLoading: false };
          } catch (err: unknown) {
            console.error(`Failed to fetch items for library "${view.Name}":`, err);
            return { view, items: [], isLoading: false };
          }
        }),
      );

      return sectionResults.filter((s) => s.items.length > 0);
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });

  return {
    sections: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
    reload: async () => {
      await query.refetch();
    },
  };
}
