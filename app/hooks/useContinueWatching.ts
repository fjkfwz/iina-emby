import type { EmbyServer } from "@shared";
import { useQuery } from "@tanstack/react-query";
import { fetchResumeItems } from "../lib/emby-library-client";
import { embyKeys } from "../lib/query-keys";

export function useContinueWatching(activeServer: EmbyServer | null, limit = 24) {
  const isEnabled = Boolean(activeServer?.serverUrl && activeServer.accessToken && activeServer.userId);

  const query = useQuery({
    queryKey: activeServer?.id ? embyKeys.continueWatching(activeServer.id) : ["empty-resume"],
    queryFn: async ({ signal }) => {
      if (!activeServer) return [];
      const result = await fetchResumeItems(activeServer, limit, signal);
      return result.items;
    },
    enabled: isEnabled,
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    retry: 2,
    retryDelay: 500,
  });

  return {
    items: query.data ?? [],
    loading: query.isLoading,
    error: query.error ? (query.error instanceof Error ? query.error.message : String(query.error)) : null,
    refresh: async () => {
      await query.refetch();
    },
  };
}
