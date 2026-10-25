import { IconAlertCircle, IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { CategoriesShelf } from "../components/CategoriesShelf";
import { ContinueWatching } from "../components/ContinueWatching";
import { FavoritesShelf } from "../components/FavoritesShelf";
import { HomeHero } from "../components/HomeHero";
import { LibraryShelf, LibraryShelfSkeleton } from "../components/LibraryShelf";
import { PageHeader } from "../components/PageHeader";
import { SearchResultsView } from "../components/SearchResultsView";
import { Alert } from "../components/ui";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useLibrarySections } from "../hooks/useLibrarySections";
import { queryClient } from "../lib/query-client";
import { embyKeys } from "../lib/query-keys";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "Home - IINA Emby" }, { name: "description", content: "Emby Media Browser" }];
}

export default function HomeRoute() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { activeServer, servers, isLoading, playMedia } = useIINABridge();
  const { sections, isLoading: isSectionsLoading, error: sectionsError } = useLibrarySections(activeServer);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const urlQ = searchParams.get("q") || "";
  const prevQRef = useRef(urlQ);

  const [searchQuery, setSearchQuery] = useState<string>(() => urlQ);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(() => urlQ);

  // Synchronize internal search state when URL param 'q' changes externally (e.g. Back/Forward navigation)
  useEffect(() => {
    if (urlQ !== searchQuery) {
      setSearchQuery(urlQ);
      setDebouncedQuery(urlQ);
      prevQRef.current = urlQ;
    }
  }, [urlQ]);

  // Support focus=search query parameter when navigating from search buttons or shortcuts
  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      searchInputRef.current?.focus();
      searchInputRef.current?.select();
    }
  }, [searchParams]);

  // Debounce search query and sync to URL search params
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = searchQuery.trim();
      setDebouncedQuery(q);
      const prevQ = prevQRef.current;
      if (q) {
        // Push a new history entry on transition from idle to searching so browser Back returns to home
        const shouldReplace = Boolean(prevQ);
        setSearchParams({ q }, { replace: shouldReplace });
        prevQRef.current = q;
        try {
          sessionStorage.setItem("emby_search_q", q);
        } catch {}
      } else {
        setSearchParams({}, { replace: true });
        prevQRef.current = "";
        try {
          sessionStorage.removeItem("emby_search_q");
        } catch {}
      }
    }, 250);

    return () => window.clearTimeout(timer);
  }, [searchQuery, setSearchParams]);

  // Global keyboard shortcut: Cmd+F or '/' to focus search input
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.metaKey && e.key.toLowerCase() === "f") || (e.key === "/" && !isInput)) {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const handleRefresh = useCallback(async () => {
    if (!activeServer || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: embyKeys.server(activeServer.id) });
    } finally {
      setIsRefreshing(false);
    }
  }, [activeServer, isRefreshing]);

  // Keep queries in memory cache when window reopens to prevent slow re-fetching;
  // Users can use the top-right Refresh button or staleTime handles updates naturally.
  useOnWindowReopen(() => {
    // Preserve cache across window refocuses
  });

  const handleIdentifySuccess = useCallback(() => {
    if (activeServer) {
      queryClient.invalidateQueries({ queryKey: embyKeys.server(activeServer.id) });
    }
  }, [activeServer]);

  const isSearching = Boolean(searchQuery.trim() || urlQ.trim());

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSearchParams({}, { replace: true });
    prevQRef.current = "";
    try {
      sessionStorage.removeItem("emby_search_q");
    } catch {}
  }, [setSearchParams]);

  const handleBack = useCallback(() => {
    if (isSearching) {
      handleClearSearch();
      searchInputRef.current?.blur();
      return;
    }
    navigate("/servers");
  }, [isSearching, handleClearSearch, navigate]);

  // Wait for IINA bridge to report servers list before redirecting if no server is known yet
  if (isLoading && !activeServer) {
    return (
      <div className={styles.container}>
        <LibraryShelfSkeleton />
        <LibraryShelfSkeleton />
      </div>
    );
  }

  // If no server is connected or configured, redirect directly to servers page
  if (servers.length === 0 || !activeServer) {
    return <Navigate to="/servers" replace />;
  }

  return (
    <div className={styles.container}>
      <PageHeader
        onBack={handleBack}
        backTitle={isSearching ? "Home" : "Servers"}
        title={activeServer.serverName || "Emby"}
        showActiveDot
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        hideSearch
        centerSection={
          <div className={styles.searchBar} onClick={() => searchInputRef.current?.focus()}>
            <IconSearch size={15} className={styles.searchIcon} aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="text"
              className={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  handleClearSearch();
                  searchInputRef.current?.blur();
                }
              }}
              placeholder="Search movies, TV series, episodes..."
              aria-label="Search library"
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearSearch();
                  searchInputRef.current?.focus();
                }}
                title="Clear search"
                aria-label="Clear search"
              >
                <IconX size={14} />
              </button>
            ) : (
              <kbd className={styles.searchKbd} title="Press Cmd+F or / to search">
                ⌘F
              </kbd>
            )}
          </div>
        }
      />

      {/* Main content: Search Results when searching, or normal shelves when idle */}
      <main className={styles.content}>
        {searchQuery.trim() ? (
          <div className={styles.searchResultsSection}>
            <SearchResultsView
              server={activeServer}
              query={debouncedQuery}
              onIdentifySuccess={handleIdentifySuccess}
            />
          </div>
        ) : (
          <>
            {/* Top Featured Hero Banner */}
            <HomeHero server={activeServer} />

            {/* Categories / Libraries shelf */}
            <CategoriesShelf server={activeServer} />

            {/* Continue Watching shelf */}
            <ContinueWatching server={activeServer} onPlayMedia={playMedia} />

            {/* My Favorites shelf */}
            <FavoritesShelf server={activeServer} onIdentifySuccess={handleIdentifySuccess} />

            {sectionsError && (
              <Alert icon={<IconAlertCircle size={16} />} title="Error loading libraries" mb="md" mx="1.5rem">
                {sectionsError.message}
              </Alert>
            )}

            {/* Library shelves (Movies, TV shows, etc.) */}
            {sections.length === 0 && isSectionsLoading ? (
              <>
                <LibraryShelfSkeleton shelfId="init-1" titleWidth={100} />
                <LibraryShelfSkeleton shelfId="init-2" titleWidth={120} />
              </>
            ) : (
              sections.map(({ view, items, isLoading: isShelfLoading }) => (
                <LibraryShelf
                  key={view.Id}
                  view={view}
                  items={items}
                  server={activeServer}
                  isLoading={isShelfLoading}
                  onIdentifySuccess={handleIdentifySuccess}
                />
              ))
            )}
          </>
        )}
      </main>
    </div>
  );
}
