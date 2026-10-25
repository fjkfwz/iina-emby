import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Data remains fresh for 5 minutes before background refetch
      staleTime: 1000 * 60 * 5,
      // Garbage collect unused queries after 30 minutes
      gcTime: 1000 * 60 * 30,
      // In desktop app, window focus should not spam the Emby server
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      // Retry transient network errors with backoff
      retry: 2,
      retryDelay: (attemptIndex) => Math.min(600 * 2 ** attemptIndex, 4000),
    },
  },
});
