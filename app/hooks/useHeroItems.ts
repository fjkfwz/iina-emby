import type { EmbyItemMetadata, EmbyServer } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { fetchHeroItems } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export function useHeroItems(server: EmbyServer | null, limit = 10) {
  const isEnabled = Boolean(server?.id && server?.serverUrl && server?.userId);

  const query = useQuery({
    queryKey: server?.id ? embyKeys.hero(server.id) : ["empty-hero"],
    queryFn: async ({ signal }) => {
      if (!server) return [];
      return fetchHeroItems(server, limit, signal);
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 10,
  });

  return {
    items: (query.data || []) as EmbyItemMetadata[],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    refetch: query.refetch,
  };
}
