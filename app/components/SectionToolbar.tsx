import { IconSearch, IconSortAscending, IconSortDescending, IconX } from "@tabler/icons-react";
import { useMemo } from "react";
import type { SectionFilter, SectionSortBy, SectionSortOrder } from "../lib/section-items";
import styles from "./SectionToolbar.module.css";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select, type SelectOption } from "./ui/Select";

export const WATCH_STATUS_OPTIONS: SelectOption[] = [
  { value: "all", label: "All" },
  { value: "unplayed", label: "Unplayed" },
  { value: "inprogress", label: "In Progress" },
  { value: "played", label: "Played" },
];

export const SORT_CRITERIA_OPTIONS: SelectOption[] = [
  { value: "name", label: "Name" },
  { value: "date", label: "Date Added" },
  { value: "year", label: "Release Year" },
  { value: "rating", label: "Rating" },
];

export interface SectionToolbarProps {
  /** Watch status filter value */
  filter?: SectionFilter;
  /** Callback on watch status filter change */
  onFilterChange?: (filter: SectionFilter) => void;

  /** Genre filter value */
  genre?: string;
  /** Callback on genre filter change */
  onGenreChange?: (genre: string) => void;
  /** Available genres in the collection */
  availableGenres?: string[];

  /** Year filter value */
  year?: string;
  /** Callback on year filter change */
  onYearChange?: (year: string) => void;
  /** Available years in the collection */
  availableYears?: number[];

  /** Title search query */
  searchQuery?: string;
  /** Callback on search query change */
  onSearchQueryChange?: (query: string) => void;

  /** Sort criteria */
  sortBy?: SectionSortBy;
  /** Callback on sort criteria change */
  onSortByChange?: (sort: SectionSortBy) => void;

  /** Sort direction */
  sortOrder?: SectionSortOrder;
  /** Callback on sort direction change */
  onSortOrderChange?: (order: SectionSortOrder) => void;

  className?: string;
}

export function SectionToolbar({
  filter = "all",
  onFilterChange,
  genre = "all",
  onGenreChange,
  availableGenres = [],
  year = "all",
  onYearChange,
  availableYears = [],
  searchQuery = "",
  onSearchQueryChange,
  sortBy = "name",
  onSortByChange,
  sortOrder = "asc",
  onSortOrderChange,
  className,
}: SectionToolbarProps) {
  const genreOptions = useMemo<SelectOption[]>(() => {
    const list: SelectOption[] = [{ value: "all", label: "All Genres" }];
    for (const g of availableGenres) {
      list.push({ value: g, label: g });
    }
    return list;
  }, [availableGenres]);

  const yearOptions = useMemo<SelectOption[]>(() => {
    const list: SelectOption[] = [{ value: "all", label: "All Years" }];
    for (const y of availableYears) {
      list.push({ value: String(y), label: String(y) });
    }
    return list;
  }, [availableYears]);

  return (
    <div className={`${styles.toolbar} ${className || ""}`}>
      {/* Left: Filter Selects */}
      <div className={styles.leftGroup}>
        {onFilterChange && (
          <Select
            data={WATCH_STATUS_OPTIONS}
            value={filter}
            onChange={(val) => {
              if (val) {
                onFilterChange(val as SectionFilter);
              }
            }}
            size="sm"
            placement="bottom-start"
          />
        )}

        {onGenreChange && genreOptions.length > 1 && (
          <Select
            data={genreOptions}
            value={genre}
            onChange={(val) => {
              if (val) {
                onGenreChange(val);
              }
            }}
            size="sm"
            placement="bottom-start"
          />
        )}

        {onYearChange && yearOptions.length > 1 && (
          <Select
            data={yearOptions}
            value={year}
            onChange={(val) => {
              if (val) {
                onYearChange(val);
              }
            }}
            size="sm"
            placement="bottom-start"
          />
        )}
      </div>

      {/* Center: Search by Title */}
      {onSearchQueryChange && (
        <div className={styles.centerGroup}>
          <Input
            size="sm"
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onSearchQueryChange("");
              }
            }}
            placeholder="Search by title..."
            aria-label="Filter media by title"
            leftSection={<IconSearch size={14} className={styles.searchIcon} aria-hidden="true" />}
            rightSection={
              searchQuery ? (
                <button
                  type="button"
                  className={styles.clearBtn}
                  onClick={() => onSearchQueryChange("")}
                  aria-label="Clear search"
                  title="Clear"
                >
                  <IconX size={12} />
                </button>
              ) : null
            }
          />
        </div>
      )}

      {/* Right: Sort Criteria Select + Direction Toggle Button */}
      {onSortByChange && (
        <div className={styles.rightGroup}>
          <Select
            data={SORT_CRITERIA_OPTIONS}
            value={sortBy}
            onChange={(val) => {
              if (val) {
                onSortByChange(val as SectionSortBy);
              }
            }}
            size="sm"
            placement="bottom-end"
          />

          {onSortOrderChange && (
            <Button
              iconOnly
              size="sm"
              onClick={() => onSortOrderChange(sortOrder === "asc" ? "desc" : "asc")}
              title={sortOrder === "asc" ? "Sort ascending (click to invert)" : "Sort descending (click to invert)"}
              aria-label={sortOrder === "asc" ? "Sort ascending, click to sort descending" : "Sort descending, click to sort ascending"}
            >
              {sortOrder === "asc" ? <IconSortAscending size={14} /> : <IconSortDescending size={14} />}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
