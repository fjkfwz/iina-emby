import type { EmbyItemMetadata } from "@shared";

export type SectionFilter = "all" | "unplayed" | "inprogress" | "played";
export type SectionSortBy = "name" | "date" | "year" | "rating";
export type SectionSortOrder = "asc" | "desc";

/**
 * Checks whether an item is currently in-progress (partially watched).
 */
export function isItemInProgress(item: EmbyItemMetadata, resumeSeriesIds?: Set<string>, resumeItemIds?: Set<string>): boolean {
  if (item.Type === "Series") {
    if (resumeSeriesIds?.has(item.Id)) return true;
    if (item.UserData?.Played) return false;
    if (typeof item.UserData?.PlayedPercentage === "number" && item.UserData.PlayedPercentage > 0) {
      return true;
    }
    const unplayed = item.UserData?.UnplayedItemCount;
    const total = item.RecursiveItemCount;
    if (typeof unplayed === "number" && typeof total === "number" && total > 0 && unplayed < total) {
      return true;
    }
    return false;
  }

  // Movies, Videos, Episodes
  if (resumeItemIds?.has(item.Id)) return true;
  return Boolean(item.UserData?.PlaybackPositionTicks && item.UserData.PlaybackPositionTicks > 0);
}

export interface FilterAndSortSectionItemsOptions {
  filter: SectionFilter;
  genre?: string;
  year?: string;
  searchQuery?: string;
  sortBy: SectionSortBy;
  sortOrder?: SectionSortOrder;
  resumeSeriesIds?: Set<string>;
  resumeItemIds?: Set<string>;
}

/**
 * Filter and sort section items in-memory.
 */
export function filterAndSortSectionItems(items: EmbyItemMetadata[], options: FilterAndSortSectionItemsOptions): EmbyItemMetadata[] {
  const { filter, genre, year, searchQuery, sortBy, sortOrder = "asc", resumeSeriesIds, resumeItemIds } = options;

  const normalizedQuery = searchQuery?.trim().toLowerCase();

  const filtered = items.filter((item) => {
    // 1. Filter by Watch Status
    if (filter === "played") {
      if (!item.UserData?.Played) return false;
    } else if (filter === "inprogress") {
      if (!isItemInProgress(item, resumeSeriesIds, resumeItemIds)) return false;
    } else if (filter === "unplayed") {
      if (item.UserData?.Played || isItemInProgress(item, resumeSeriesIds, resumeItemIds)) return false;
    }

    // 2. Filter by Genre
    if (genre && genre !== "all") {
      const hasGenre =
        (Array.isArray(item.Genres) && item.Genres.includes(genre)) ||
        (Array.isArray(item.GenreItems) && item.GenreItems.some((g) => g.Name === genre));
      if (!hasGenre) return false;
    }

    // 3. Filter by Year
    if (year && year !== "all") {
      const itemYear = item.ProductionYear ?? (item.PremiereDate ? new Date(item.PremiereDate).getFullYear() : 0);
      if (year === "earlier") {
        if (itemYear <= 0 || itemYear >= 1990) return false;
      } else if (year.endsWith("s")) {
        const decade = parseInt(year, 10);
        if (itemYear < decade || itemYear >= decade + 10) return false;
      } else {
        const targetYear = parseInt(year, 10);
        if (itemYear !== targetYear) return false;
      }
    }

    // 4. Filter by Search Query
    if (normalizedQuery) {
      const name = item.Name?.toLowerCase() ?? "";
      const seriesName = item.SeriesName?.toLowerCase() ?? "";
      const originalTitle = item.OriginalTitle?.toLowerCase() ?? "";
      if (!name.includes(normalizedQuery) && !seriesName.includes(normalizedQuery) && !originalTitle.includes(normalizedQuery)) {
        return false;
      }
    }

    return true;
  });

  return filtered.sort((a, b) => {
    let result = 0;
    switch (sortBy) {
      case "name":
        result = (a.Name || "").localeCompare(b.Name || "", undefined, { sensitivity: "base", numeric: true });
        break;
      case "date": {
        const da = a.DateCreated ? new Date(a.DateCreated).getTime() : 0;
        const db = b.DateCreated ? new Date(b.DateCreated).getTime() : 0;
        result = da - db;
        break;
      }
      case "year": {
        const getYear = (it: EmbyItemMetadata) => it.ProductionYear ?? (it.PremiereDate ? new Date(it.PremiereDate).getFullYear() : 0);
        result = getYear(a) - getYear(b);
        break;
      }
      case "rating": {
        const ra = a.CommunityRating ?? 0;
        const rb = b.CommunityRating ?? 0;
        result = ra - rb;
        break;
      }
      default:
        result = 0;
    }
    return sortOrder === "asc" ? result : -result;
  });
}
