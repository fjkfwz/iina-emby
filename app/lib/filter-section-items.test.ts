import type { EmbyItemMetadata } from "@shared";
import { describe, expect, it } from "vitest";
import { filterAndSortSectionItems } from "./section-items";

describe("filterAndSortSectionItems", () => {
  const sampleItems: EmbyItemMetadata[] = [
    {
      Id: "1",
      Name: "The Matrix",
      Type: "Movie",
      ProductionYear: 1999,
      Genres: ["Action", "Sci-Fi"],
      CommunityRating: 8.7,
      DateCreated: "2024-01-01T10:00:00Z",
      UserData: { Played: true },
    },
    {
      Id: "2",
      Name: "Inception",
      Type: "Movie",
      ProductionYear: 2010,
      Genres: ["Action", "Sci-Fi", "Thriller"],
      CommunityRating: 8.8,
      DateCreated: "2024-02-01T10:00:00Z",
      UserData: { Played: false, PlaybackPositionTicks: 5000 },
    },
    {
      Id: "3",
      Name: "Interstellar",
      Type: "Movie",
      ProductionYear: 2014,
      Genres: ["Adventure", "Drama", "Sci-Fi"],
      CommunityRating: 8.6,
      DateCreated: "2024-03-01T10:00:00Z",
      UserData: { Played: false, PlaybackPositionTicks: 0 },
    },
    {
      Id: "4",
      Name: "Breaking Bad",
      Type: "Series",
      ProductionYear: 2008,
      Genres: ["Crime", "Drama", "Thriller"],
      CommunityRating: 9.5,
      DateCreated: "2024-01-15T10:00:00Z",
      UserData: { Played: false, UnplayedItemCount: 10 },
      RecursiveItemCount: 62,
    },
  ];

  it("filters correctly by watch status", () => {
    // Played
    const played = filterAndSortSectionItems(sampleItems, {
      filter: "played",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(played.map((i) => i.Name)).toEqual(["The Matrix"]);

    // In Progress (Inception with PlaybackPositionTicks > 0, and Breaking Bad with 10 unplayed out of 62)
    const inProgress = filterAndSortSectionItems(sampleItems, {
      filter: "inprogress",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(inProgress.map((i) => i.Name)).toEqual(["Breaking Bad", "Inception"]);

    // Unplayed (only untouched Interstellar)
    const unplayed = filterAndSortSectionItems(sampleItems, {
      filter: "unplayed",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(unplayed.map((i) => i.Name)).toEqual(["Interstellar"]);

    // All
    const all = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(all).toHaveLength(4);
  });

  it("filters correctly by search query (case-insensitive and trimmed)", () => {
    const results = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      searchQuery: "  matrix  ",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(results.map((i) => i.Name)).toEqual(["The Matrix"]);

    const multiResults = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      searchQuery: "in",
      sortBy: "name",
      sortOrder: "asc",
    });
    // Inception, Interstellar, Breaking Bad (contains in)
    expect(multiResults.map((i) => i.Name)).toEqual(["Breaking Bad", "Inception", "Interstellar"]);
  });

  it("sorts correctly by criteria and direction", () => {
    // Name asc
    const nameAsc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(nameAsc.map((i) => i.Name)).toEqual(["Breaking Bad", "Inception", "Interstellar", "The Matrix"]);

    // Name desc
    const nameDesc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "name",
      sortOrder: "desc",
    });
    expect(nameDesc.map((i) => i.Name)).toEqual(["The Matrix", "Interstellar", "Inception", "Breaking Bad"]);

    // Year desc
    const yearDesc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "year",
      sortOrder: "desc",
    });
    expect(yearDesc.map((i) => i.Name)).toEqual(["Interstellar", "Inception", "Breaking Bad", "The Matrix"]);

    // Year asc
    const yearAsc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "year",
      sortOrder: "asc",
    });
    expect(yearAsc.map((i) => i.Name)).toEqual(["The Matrix", "Breaking Bad", "Inception", "Interstellar"]);

    // Rating desc
    const ratingDesc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "rating",
      sortOrder: "desc",
    });
    expect(ratingDesc.map((i) => i.Name)).toEqual(["Breaking Bad", "Inception", "The Matrix", "Interstellar"]);

    // Date Added desc
    const dateDesc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "date",
      sortOrder: "desc",
    });
    expect(dateDesc.map((i) => i.Name)).toEqual(["Interstellar", "Inception", "Breaking Bad", "The Matrix"]);

    // Date Added asc
    const dateAsc = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      sortBy: "date",
      sortOrder: "asc",
    });
    expect(dateAsc.map((i) => i.Name)).toEqual(["The Matrix", "Breaking Bad", "Inception", "Interstellar"]);
  });

  it("filters correctly by genre", () => {
    const scifi = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      genre: "Sci-Fi",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(scifi.map((i) => i.Name)).toEqual(["Inception", "Interstellar", "The Matrix"]);

    const crime = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      genre: "Crime",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(crime.map((i) => i.Name)).toEqual(["Breaking Bad"]);
  });

  it("filters correctly by exact year and decade", () => {
    const exact = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      year: "1999",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(exact.map((i) => i.Name)).toEqual(["The Matrix"]);

    const decade2010s = filterAndSortSectionItems(sampleItems, {
      filter: "all",
      year: "2010s",
      sortBy: "name",
      sortOrder: "asc",
    });
    expect(decade2010s.map((i) => i.Name)).toEqual(["Inception", "Interstellar"]);
  });

  it("combines filter, search query, genre, year, and sorting together seamlessly", () => {
    const combined = filterAndSortSectionItems(sampleItems, {
      filter: "inprogress",
      genre: "Sci-Fi",
      year: "2010",
      searchQuery: "cep",
      sortBy: "rating",
      sortOrder: "desc",
    });
    expect(combined.map((i) => i.Name)).toEqual(["Inception"]);
  });
});
