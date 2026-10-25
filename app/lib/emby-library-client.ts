import type {
  EmbyItemMetadata,
  EmbyItemsResponse,
  EmbyServer,
  EmbySystemInfo,
  EmbyUserData,
  EmbyView,
  RemoteSearchQuery,
  RemoteSearchResult,
} from "@shared";
import { buildAuthorizationHeader } from "./emby-auth-client";

const DEFAULT_CACHE_TTL_MS = 60_000;

export function clearLibraryCache(): void {
  // Maintained for backward compatibility; TanStack Query manages the query cache
}

async function getOrFetchCached<T>(_key: string, _ttlMs: number, _bypassCache: boolean, fetcher: () => Promise<T>): Promise<T> {
  return fetcher();
}

/**
 * Resilient HTTP fetcher for Emby API:
 * 1. Automatically attaches `api_key` to query parameters.
 * 2. Attaches standard headers (Accept: application/json and standard Authorization).
 * 3. Automatically retries on transient network errors (e.g. Load failed, connection drop)
 *    or server reverse proxy errors (502, 503, 504) with backoff.
 */
export async function embyFetch(
  server: EmbyServer,
  urlStr: string,
  init?: RequestInit & { retries?: number },
): Promise<Response> {
  const method = (init?.method || "GET").toUpperCase();
  const maxRetries = init?.retries ?? (method === "GET" ? 2 : 1);

  const base = server.serverUrl.replace(/\/+$/, "");
  const fullUrlStr = urlStr.startsWith("http://") || urlStr.startsWith("https://")
    ? urlStr
    : `${base}${urlStr.startsWith("/") ? "" : "/"}${urlStr}`;

  const parsedUrl = new URL(fullUrlStr);
  if (server.accessToken && !parsedUrl.searchParams.has("api_key")) {
    parsedUrl.searchParams.set("api_key", server.accessToken);
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    ...((init?.headers as Record<string, string>) || {}),
  };
  if (server.accessToken && !headers.Authorization) {
    headers.Authorization = buildAuthorizationHeader(server.accessToken);
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const response = await fetch(parsedUrl.toString(), {
        ...init,
        method,
        headers,
      });

      if (!response.ok && [502, 503, 504].includes(response.status) && attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, attempt * 300));
        continue;
      }

      return response;
    } catch (err: unknown) {
      lastError = err;
      if (init?.signal?.aborted) {
        throw err;
      }
      if (attempt < maxRetries) {
        attempt++;
        await new Promise((r) => setTimeout(r, attempt * 300));
      } else {
        break;
      }
    }
  }

  throw lastError;
}

export interface FetchResumeItemsResult {
  items: EmbyItemMetadata[];
  totalRecordCount: number;
}

/**
 * Fetch Continue Watching (Resume) items for the active user from Emby server.
 */
export async function fetchResumeItems(
  server: EmbyServer,
  options?: number | { limit?: number; startIndex?: number },
  signal?: AbortSignal,
): Promise<FetchResumeItemsResult> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const limit = typeof options === "number" ? options : (options?.limit ?? 12);
  const startIndex = typeof options === "object" ? (options?.startIndex ?? 0) : 0;

  const query = new URLSearchParams({
    StartIndex: String(startIndex),
    Recursive: "true",
    MediaTypes: "Video",
    Fields:
      "PrimaryImageAspectRatio,BasicSyncInfo,ProductionYear,UserData,SeriesName,SeasonId,SeriesId,ParentIndexNumber,IndexNumber,MediaSources,ImageTags,BackdropImageTags,ParentBackdropItemId,ParentBackdropImageTags,ParentThumbItemId,ParentThumbImageTag,SeriesPrimaryImageTag",
    EnableImageTypes: "Primary,Backdrop,Thumb",
    ImageTypeLimit: "1",
  });

  if (limit > 0) {
    query.set("Limit", String(limit));
  }

  const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items/Resume?${query.toString()}`;
  const response = await embyFetch(server, url, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch resume items: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
  return {
    items: data.Items || [],
    totalRecordCount: data.TotalRecordCount ?? (data.Items?.length || 0),
  };
}

/**
 * Fetch root user library views (e.g. Movies, TV shows).
 */
export async function fetchUserViews(server: EmbyServer, signal?: AbortSignal, bypassCache = false): Promise<EmbyView[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:views`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Views`;

    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch user views: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyView>;
    return data.Items || [];
  });
}

/**
 * Fetch favorite items for the active user.
 */
export async function fetchFavoriteItems(
  server: EmbyServer,
  limit = 24,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<EmbyItemMetadata[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:favorites:${limit}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      Filters: "IsFavorite",
      Recursive: "true",
      SortBy: "SortName",
      SortOrder: "Ascending",
      Limit: String(limit),
      Fields:
        "CommunityRating,ProductionYear,Genres,GenreItems,ImageTags,BackdropImageTags,UserData,PrimaryImageAspectRatio,SeriesName,ProviderIds",
      EnableImageTypes: "Primary,Backdrop,Thumb",
      ImageTypeLimit: "1",
    });

    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch favorite items: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
    return data.Items || [];
  });
}

/**
 * Fetch featured hero carousel items for the home page.
 */
export async function fetchHeroItems(
  server: EmbyServer,
  limit = 10,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<EmbyItemMetadata[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:hero:${limit}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      SortBy: "DateCreated",
      SortOrder: "Descending",
      IncludeItemTypes: "Movie,Series",
      Recursive: "true",
      ImageTypes: "Backdrop",
      HasOverview: "true",
      Limit: String(limit),
      Fields: "Overview,CommunityRating,ProductionYear,Genres,BackdropImageTags,ImageTags,UserData",
    });

    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch hero items: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
    return (data.Items || []).filter((item) => item.BackdropImageTags && item.BackdropImageTags.length > 0);
  });
}


/**
 * Fetch latest items for a specific library (ParentId).
 */
export async function fetchLatestItems(
  server: EmbyServer,
  parentId: string,
  limit = 16,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<EmbyItemMetadata[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:latest:${parentId}:${limit}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      ParentId: parentId,
      Limit: String(limit),
      Fields: "CommunityRating,ProductionYear,ImageTags,BackdropImageTags,UserData,PrimaryImageAspectRatio,SeriesName,ProviderIds",
      EnableImageTypes: "Primary,Backdrop,Thumb",
      ImageTypeLimit: "1",
    });

    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items/Latest?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch latest items for library ${parentId}: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemMetadata[];
    return Array.isArray(data) ? data : [];
  });
}

export interface FetchSectionItemsResult {
  items: EmbyItemMetadata[];
  totalRecordCount: number;
}

/**
 * Fetch all items for a specific library section (ParentId).
 */
export async function fetchSectionItems(
  server: EmbyServer,
  parentId: string,
  options?: {
    sortBy?: string;
    sortOrder?: "Ascending" | "Descending";
    limit?: number;
    startIndex?: number;
    includeItemTypes?: string;
    filter?: "all" | "played";
  },
  signal?: AbortSignal,
  bypassCache = false,
): Promise<FetchSectionItemsResult> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const sortBy = options?.sortBy || "SortName";
  const sortOrder = options?.sortOrder || "Ascending";
  const limit = options?.limit ?? 500;
  const startIndex = options?.startIndex ?? 0;
  const includeItemTypes = options?.includeItemTypes || "Movie,Series,BoxSet,Video";
  const filter = options?.filter || "all";

  const cacheKey = `${base}:${server.userId}:section:${parentId}:${sortBy}:${sortOrder}:${startIndex}:${limit}:${includeItemTypes}:${filter}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      Recursive: "true",
      SortBy: sortBy,
      SortOrder: sortOrder,
      StartIndex: String(startIndex),
      Limit: String(limit),
      IncludeItemTypes: includeItemTypes,
      Fields:
        "CommunityRating,ProductionYear,Genres,GenreItems,ImageTags,BackdropImageTags,UserData,PrimaryImageAspectRatio,SeriesName,ProviderIds",
      EnableImageTypes: "Primary,Backdrop,Thumb",
      ImageTypeLimit: "1",
    });

    if (parentId === "favorites") {
      query.set("Filters", "IsFavorite");
    } else {
      query.set("ParentId", parentId);
      if (filter === "played") {
        query.set("Filters", "IsPlayed");
      }
    }

    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch section items: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
    return {
      items: data.Items || [],
      totalRecordCount: data.TotalRecordCount ?? (data.Items?.length || 0),
    };
  });
}

export interface SectionAllData {
  items: EmbyItemMetadata[];
  resumeSeriesIds: Set<string>;
  resumeItemIds: Set<string>;
}

/**
 * Fetch all items for a library section once, alongside resume data,
 * enabling instant client-side filtering, searching, and sorting.
 */
export async function fetchAllSectionData(
  server: EmbyServer,
  parentId: string,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<SectionAllData> {
  const [sectionResult, resumeResult] = await Promise.all([
    fetchSectionItems(
      server,
      parentId,
      { limit: 2000, startIndex: 0, filter: "all", sortBy: "SortName", sortOrder: "Ascending" },
      signal,
      bypassCache,
    ),
    fetchResumeItems(server, 100, signal).catch(() => ({ items: [], totalRecordCount: 0 })),
  ]);

  const resumeSeriesIds = new Set(resumeResult.items.map((r) => r.SeriesId).filter((id): id is string => Boolean(id)));
  const resumeItemIds = new Set(resumeResult.items.map((r) => r.Id));

  return {
    items: sectionResult.items,
    resumeSeriesIds,
    resumeItemIds,
  };
}

/**
 * Fetch next up episode for a series.
 */
export async function fetchNextUp(server: EmbyServer, seriesId: string, signal?: AbortSignal): Promise<EmbyItemMetadata | null> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const query = new URLSearchParams({
    SeriesId: seriesId,
    UserId: server.userId,
    Limit: "1",
    Fields: "UserData,MediaSources,MediaStreams,ImageTags,Overview,RunTimeTicks,PremiereDate,ParentIndexNumber,IndexNumber",
  });

  const url = `${base}/Shows/NextUp?${query.toString()}`;
  const response = await embyFetch(server, url, {
    signal,
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
  return data.Items?.[0] || null;
}

/**
 * Fetch full details for a single item.
 */
export async function fetchItemDetails(
  server: EmbyServer,
  itemId: string,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<EmbyItemMetadata> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:item:${itemId}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const url = `${base}/Users/${encodeURIComponent(server.userId)}/Items/${encodeURIComponent(itemId)}?Fields=MediaSources,MediaStreams,People,Overview,Genres,Studios,UserData,RunTimeTicks`;

    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch item details: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as EmbyItemMetadata;
  });
}

/**
 * Image descriptor returned by /Items/{id}/Images.
 */
export interface EmbyImageInfo {
  ImageType: string;
  ImageIndex?: number;
  Path?: string;
  Filename?: string;
  Height?: number;
  Width?: number;
  Size?: number;
}

/**
 * Fetch all available images for an item.
 */
export async function fetchItemImages(server: EmbyServer, itemId: string, signal?: AbortSignal): Promise<EmbyImageInfo[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const url = `${base}/Items/${encodeURIComponent(itemId)}/Images`;

  try {
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      return [];
    }

    return (await response.json()) as EmbyImageInfo[];
  } catch {
    return [];
  }
}

/**
 * Builds the direct static video stream URL for playing an item in IINA.
 */
export function buildStreamUrl(server: EmbyServer, itemId: string): string {
  const base = server.serverUrl.replace(/\/+$/, "");
  return `${base}/Videos/${encodeURIComponent(itemId)}/stream?static=true&api_key=${encodeURIComponent(server.accessToken)}`;
}

/**
 * Fetch all seasons for a series.
 */
export async function fetchSeasons(
  server: EmbyServer,
  seriesId: string,
  signal?: AbortSignal,
  bypassCache = false,
): Promise<EmbyItemMetadata[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:seasons:${seriesId}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      UserId: server.userId,
      Fields: "ItemCounts,PrimaryImageAspectRatio,Overview,UserData",
    });

    const url = `${base}/Shows/${encodeURIComponent(seriesId)}/Seasons?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch seasons: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
    return data.Items || [];
  });
}

/**
 * Fetch episodes for a series, optionally filtered by seasonId and limit.
 */
export async function fetchEpisodes(
  server: EmbyServer,
  seriesId: string,
  seasonId?: string,
  signal?: AbortSignal,
  bypassCache = false,
  limit?: number,
): Promise<EmbyItemMetadata[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:${server.userId}:episodes:${seriesId}:${seasonId || "all"}${limit ? `:${limit}` : ""}`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const query = new URLSearchParams({
      UserId: server.userId,
      Fields:
        "Overview,PrimaryImageAspectRatio,SeriesName,SeasonId,SeriesId,ParentIndexNumber,IndexNumber,MediaSources,MediaStreams,ImageTags,UserData,RunTimeTicks",
    });

    if (seasonId) {
      query.set("SeasonId", seasonId);
      query.set("seasonId", seasonId);
    }
    if (limit) {
      query.set("Limit", String(limit));
    }

    const url = `${base}/Shows/${encodeURIComponent(seriesId)}/Episodes?${query.toString()}`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch episodes: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as EmbyItemsResponse<EmbyItemMetadata>;
    const items = data.Items || [];

    // Fallback client-side filtering: in case the Emby server ignores SeasonId and returns all episodes
    if (seasonId && items.length > 0 && items.some((item) => item.SeasonId && String(item.SeasonId) !== String(seasonId))) {
      return items.filter((item) => String(item.SeasonId) === String(seasonId));
    }

    return items;
  });
}

/**
 * Fetch authenticated server system information (version, updates, OS).
 */
export async function fetchServerSystemInfo(server: EmbyServer, signal?: AbortSignal, bypassCache = false): Promise<EmbySystemInfo> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const cacheKey = `${base}:system_info`;

  return getOrFetchCached(cacheKey, DEFAULT_CACHE_TTL_MS, bypassCache, async () => {
    const url = `${base}/System/Info`;
    const response = await embyFetch(server, url, {
      signal,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch system info: ${response.status} ${response.statusText}`);
    }

    return (await response.json()) as EmbySystemInfo;
  });
}

/**
 * Mark an item as played (POST) or unplayed (DELETE) in Emby.
 */
export async function setItemPlayedStatus(server: EmbyServer, itemId: string, played: boolean): Promise<EmbyUserData> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const url = `${base}/Users/${encodeURIComponent(server.userId)}/PlayedItems/${encodeURIComponent(itemId)}`;

  const response = await embyFetch(server, url, {
    method: played ? "POST" : "DELETE",
  });

  if (!response.ok) {
    throw new Error(`Failed to update played status: ${response.status} ${response.statusText}`);
  }

  clearLibraryCache();

  const text = await response.text();
  try {
    return text ? (JSON.parse(text) as EmbyUserData) : { Played: played };
  } catch {
    return { Played: played };
  }
}

export interface EmbyScanTaskStatus {
  /** "Idle" | "Running" | "Cancelling" */
  state: string;
  progress: number | null;
  lastEndTime?: string;
  lastStatus?: string;
}

/**
 * Trigger a scan of all media libraries (admin only). Returns immediately; the scan runs server-side.
 */
export async function startLibraryScan(server: EmbyServer): Promise<void> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const response = await embyFetch(server, `${base}/Library/Refresh`, {
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`Failed to start library scan: ${response.status} ${response.statusText}`);
  }
}

/**
 * Read the state of the "Scan media library" scheduled task (admin only).
 */
export async function fetchLibraryScanStatus(server: EmbyServer, signal?: AbortSignal): Promise<EmbyScanTaskStatus | null> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const response = await embyFetch(server, `${base}/ScheduledTasks?IsHidden=false`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch scheduled tasks: ${response.status} ${response.statusText}`);
  }

  const tasks = (await response.json()) as Array<{
    Key?: string;
    State?: string;
    CurrentProgressPercentage?: number;
    LastExecutionResult?: { EndTimeUtc?: string; Status?: string };
  }>;
  const task = tasks.find((t) => t.Key === "RefreshLibrary");
  if (!task) return null;

  return {
    state: task.State ?? "Idle",
    progress: typeof task.CurrentProgressPercentage === "number" ? task.CurrentProgressPercentage : null,
    lastEndTime: task.LastExecutionResult?.EndTimeUtc,
    lastStatus: task.LastExecutionResult?.Status,
  };
}

/**
 * Normalizes item type to Emby RemoteSearch endpoint type.
 */
export function getIdentifyItemType(itemType?: string): string | null {
  if (!itemType) return null;
  switch (itemType) {
    case "Movie":
      return "Movie";
    case "Series":
      return "Series";
    case "Episode":
      return "Episode";
    case "BoxSet":
      return "BoxSet";
    case "MusicAlbum":
      return "MusicAlbum";
    case "MusicArtist":
      return "MusicArtist";
    default:
      return null;
  }
}

/**
 * Checks whether an item type supports the RemoteSearch / Identify feature.
 */
export function isIdentifySupported(itemType?: string): boolean {
  return getIdentifyItemType(itemType) !== null;
}

/**
 * Searches external metadata providers (TMDb, TVDb, IMDb) via Emby RemoteSearch.
 */
export async function searchRemoteItem(
  server: EmbyServer,
  itemType: string,
  query: RemoteSearchQuery,
  signal?: AbortSignal,
): Promise<RemoteSearchResult[]> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const targetType = getIdentifyItemType(itemType) || itemType;
  const url = `${base}/Items/RemoteSearch/${encodeURIComponent(targetType)}`;

  const response = await embyFetch(server, url, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Failed to search remote items: ${response.status} ${response.statusText}`);
  }

  const results = (await response.json()) as RemoteSearchResult[];
  return Array.isArray(results) ? results : [];
}

/**
 * Applies a selected RemoteSearchResult to the specified item and refreshes metadata.
 */
export async function applyRemoteSearchResult(
  server: EmbyServer,
  itemId: string,
  result: RemoteSearchResult,
  replaceAllImages = true,
): Promise<void> {
  const base = server.serverUrl.replace(/\/+$/, "");
  const url = `${base}/Items/RemoteSearch/Apply/${encodeURIComponent(itemId)}?replaceAllImages=${replaceAllImages}`;

  const response = await embyFetch(server, url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(errorText || `Failed to apply remote search result: ${response.status} ${response.statusText}`);
  }

  clearLibraryCache();
}
