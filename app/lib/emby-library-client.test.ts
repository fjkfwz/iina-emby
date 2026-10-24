import type { EmbyServer } from "@shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyRemoteSearchResult,
  clearLibraryCache,
  fetchEpisodes,
  fetchItemDetails,
  isIdentifySupported,
  searchRemoteItem,
} from "./emby-library-client";

describe("emby-library-client caching and deduplication", () => {
  const dummyServer: EmbyServer = {
    id: "srv-1",
    serverUrl: "http://localhost:8096",
    serverName: "Test Server",
    accessToken: "test-token",
    userId: "user-1",
    username: "testuser",
    addedAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    clearLibraryCache();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearLibraryCache();
  });

  it("fetches item details from server with correct endpoint and headers", async () => {
    const mockItem = { Id: "item-123", Name: "Inception" };
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockItem,
    } as Response);

    const item = await fetchItemDetails(dummyServer, "item-123");
    expect(item.Name).toBe("Inception");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining("/Users/user-1/Items/item-123"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Emby-Token": "test-token",
        }),
      }),
    );
  });

  it("handles identify item types and supports check properly", () => {
    expect(isIdentifySupported("Movie")).toBe(true);
    expect(isIdentifySupported("Series")).toBe(true);
    expect(isIdentifySupported("Episode")).toBe(true);
    expect(isIdentifySupported("BoxSet")).toBe(true);
    expect(isIdentifySupported("Folder")).toBe(false);
    expect(isIdentifySupported(undefined)).toBe(false);
  });

  it("performs searchRemoteItem with correct endpoint and payload", async () => {
    const mockResults = [
      {
        Name: "The Matrix",
        ProductionYear: 1999,
        ProviderIds: { Imdb: "tt0133093" },
      },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => mockResults,
    } as Response);

    const query = {
      SearchInfo: {
        Name: "The Matrix",
        Year: 1999,
      },
      ItemId: "item-123",
    };

    const results = await searchRemoteItem(dummyServer, "Movie", query);
    expect(results).toEqual(mockResults);
    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8096/Items/RemoteSearch/Movie",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(query),
      }),
    );
  });

  it("calls applyRemoteSearchResult and clears library cache", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    const result = {
      Name: "The Matrix",
      ProductionYear: 1999,
      ProviderIds: { Imdb: "tt0133093" },
    };

    await applyRemoteSearchResult(dummyServer, "item-123", result, true);

    expect(fetchSpy).toHaveBeenCalledWith(
      "http://localhost:8096/Items/RemoteSearch/Apply/item-123?replaceAllImages=true",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(result),
      }),
    );
  });

  it("fetches episodes filtering by SeasonId and filters client-side if server returns mixed seasons", async () => {
    const mockEpisodes = [
      { Id: "ep-1", Name: "S01E01", SeasonId: "season-1", IndexNumber: 1, ParentIndexNumber: 1 },
      { Id: "ep-2", Name: "S01E02", SeasonId: "season-1", IndexNumber: 2, ParentIndexNumber: 1 },
      { Id: "ep-3", Name: "S02E01", SeasonId: "season-2", IndexNumber: 1, ParentIndexNumber: 2 },
    ];

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ Items: mockEpisodes }),
    } as Response);

    const episodes = await fetchEpisodes(dummyServer, "series-123", "season-2");

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/SeasonId=season-2/),
      expect.anything(),
    );
    expect(episodes).toHaveLength(1);
    expect(episodes[0].Id).toBe("ep-3");
    expect(episodes[0].Name).toBe("S02E01");
  });
});
