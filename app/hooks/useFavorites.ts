import type { EmbyItemMetadata, EmbyServer } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { fetchFavoriteItems } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export function useFavorites(server: EmbyServer | null) {
  const query = useQuery({
    queryKey: server?.id ? embyKeys.favorites(server.id) : ["empty-favorites"],
    queryFn: async ({ signal }) => {
      if (!server) return [];
      return fetchFavoriteItems(server, 24, signal);
    },
    staleTime: 1000 * 60 * 5,
    enabled: Boolean(server?.id && server?.serverUrl && server?.userId),
  });

  return {
    items: (query.data || []) as EmbyItemMetadata[],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    refetch: query.refetch,
  };
}
