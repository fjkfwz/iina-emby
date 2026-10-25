import type { EmbyServer, EmbyView } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { fetchUserViews } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export function useUserViews(server: EmbyServer | null) {
  const query = useQuery({
    queryKey: server?.id ? embyKeys.userViews(server.id) : ["empty-views"],
    queryFn: async ({ signal }) => {
      if (!server) return [];
      const views = await fetchUserViews(server, signal);
      return views.filter(
        (v) => !v.CollectionType || ["movies", "tvshows", "homevideos", "boxsets"].includes(v.CollectionType),
      );
    },
    staleTime: 1000 * 60 * 10,
    enabled: Boolean(server?.id && server?.serverUrl && server?.userId),
  });

  return {
    views: (query.data || []) as EmbyView[],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    refetch: query.refetch,
  };
}
