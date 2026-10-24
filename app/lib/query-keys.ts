export const embyKeys = {
  all: ["emby"] as const,
  server: (serverId: string) => [...embyKeys.all, serverId] as const,
  userViews: (serverId: string) => [...embyKeys.server(serverId), "views"] as const,
  librarySections: (serverId: string) => [...embyKeys.server(serverId), "librarySections"] as const,
  continueWatching: (serverId: string) => [...embyKeys.server(serverId), "continueWatching"] as const,
  favorites: (serverId: string) => [...embyKeys.server(serverId), "favorites"] as const,
  section: (serverId: string, sectionId: string) => [...embyKeys.server(serverId), "section", sectionId] as const,
  item: (serverId: string, itemId: string) => [...embyKeys.server(serverId), "item", itemId] as const,
  nextUp: (serverId: string, seriesId: string) => [...embyKeys.server(serverId), "nextUp", seriesId] as const,
  seasons: (serverId: string, seriesId: string) => [...embyKeys.server(serverId), "seasons", seriesId] as const,
  seriesEpisodes: (serverId: string, seriesId: string, seasonId?: string) =>
    [...embyKeys.server(serverId), "episodes", seriesId, seasonId ?? "all"] as const,
};
