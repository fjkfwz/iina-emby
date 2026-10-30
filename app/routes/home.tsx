import { IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { CategoriesShelf } from "../components/CategoriesShelf";
import { ContinueWatching } from "../components/ContinueWatching";
import { FavoritesShelf } from "../components/FavoritesShelf";
import { HomeHero } from "../components/HomeHero";
import { LibraryShelf, LibraryShelfSkeleton } from "../components/LibraryShelf";
import { PageHeader } from "../components/PageHeader";
import { SearchBox, type SearchBoxHandle } from "../components/SearchBox";
import { SearchResultsView } from "../components/SearchResultsView";
import { Alert } from "../components/ui";
import { useHomeModulesConfig } from "../hooks/useHomeModulesConfig";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useLibrarySections } from "../hooks/useLibrarySections";
import { queryClient } from "../lib/query-client";
import { embyKeys } from "../lib/query-keys";
import { useTranslation } from "../lib/i18n";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "Home - IINA Emby" }, { name: "description", content: "Emby Media Browser" }];
}

export interface HomeRouteProps {
  isVisible?: boolean;
}

export default function HomeRoute({ isVisible = true }: HomeRouteProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchBoxRef = useRef<SearchBoxHandle>(null);

  const { activeServer, servers, isLoading, playMedia, playMediaList } = useIINABridge();
  const { config: modulesConfig } = useHomeModulesConfig();
  const { sections, isLoading: isSectionsLoading, error: sectionsError } = useLibrarySections(activeServer);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const urlQ = searchParams.get("q") || "";

  /** Query that actually drives the results request (updated on the debounce boundary). */
  const [query, setQuery] = useState<string>(urlQ);
  /** Switches between the shelves and the results view — flips on the first keystroke. */
  const [isSearching, setIsSearching] = useState<boolean>(urlQ.trim().length > 0);
  /** Mirrors the `?q=` param so we never navigate to the URL we are already on. */
  const committedRef = useRef<string>(urlQ);

  // Synchronize internal search state when URL param 'q' changes externally (e.g. Back/Forward navigation)
  useEffect(() => {
    if (urlQ === committedRef.current) return;
    committedRef.current = urlQ;
    setQuery(urlQ);
    setIsSearching(urlQ.trim().length > 0);
  }, [urlQ]);

  // Support focus=search query parameter when navigating from search buttons or shortcuts
  useEffect(() => {
    if (searchParams.get("focus") === "search") {
      searchBoxRef.current?.focus();
      searchBoxRef.current?.select();
    }
  }, [searchParams]);

  const handleCommit = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      setIsSearching(nextQuery.length > 0);

      if (nextQuery === committedRef.current) return;
      const previousQuery = committedRef.current;
      committedRef.current = nextQuery;

      if (nextQuery) {
        // Push a new history entry on transition from idle to searching so browser Back returns to home
        setSearchParams({ q: nextQuery }, { replace: Boolean(previousQuery) });
        try {
          sessionStorage.setItem("emby_search_q", nextQuery);
        } catch {}
      } else {
        setSearchParams({}, { replace: true });
        try {
          sessionStorage.removeItem("emby_search_q");
        } catch {}
      }
    },
    [setSearchParams],
  );

  // Global keyboard shortcut: Cmd+F or '/' to focus search input
  useEffect(() => {
    if (!isVisible) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.metaKey && e.key.toLowerCase() === "f") || (e.key === "/" && !isInput)) {
        e.preventDefault();
        searchBoxRef.current?.focus();
        searchBoxRef.current?.select();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isVisible]);

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

  const handleClearSearch = useCallback(() => {
    searchBoxRef.current?.clear();
  }, []);

  const handleEscape = useCallback(
    (hasText: boolean) => {
      if (hasText) {
        searchBoxRef.current?.clear();
      } else {
        searchBoxRef.current?.blur();
      }
    },
    [],
  );

  const handleBack = useCallback(() => {
    if (isSearching) {
      handleClearSearch();
      searchBoxRef.current?.blur();
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
        backTitle={isSearching ? t("home", "Home") : t("servers", "Servers")}
        title={activeServer.serverName || "Emby"}
        showActiveDot
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
        hideSearch
        shadowOnScroll
        forceShadow={isSearching}
        centerSection={
          <SearchBox
            ref={searchBoxRef}
            value={urlQ}
            onCommit={handleCommit}
            onHasTextChange={setIsSearching}
            onEscape={handleEscape}
            ariaLabel={t("search", "Search")}
          />
        }
      />

      {/* Main content: Search Results when searching, or normal shelves when idle */}
      <main className={styles.content}>
        {isSearching ? (
          <div className={styles.searchResultsSection}>
            <SearchResultsView
              server={activeServer}
              query={query}
              onIdentifySuccess={handleIdentifySuccess}
            />
          </div>
        ) : (
          <>
            {/* Top Featured Hero Banner */}
            {modulesConfig.hero && <HomeHero server={activeServer} isVisible={isVisible} />}

            {/* Categories / Libraries shelf */}
            {modulesConfig.categories && <CategoriesShelf server={activeServer} />}

            {/* Continue Watching shelf */}
            {modulesConfig.continueWatching && (
              <ContinueWatching server={activeServer} onPlayMedia={playMedia} onPlayMediaList={playMediaList} />
            )}

            {/* My Favorites shelf */}
            {modulesConfig.favorites && <FavoritesShelf server={activeServer} onIdentifySuccess={handleIdentifySuccess} />}

            {sectionsError && (
              <Alert icon={<IconAlertCircle size={16} />} title="Error loading libraries" mb="md" mx="1.5rem">
                {sectionsError.message}
              </Alert>
            )}

            {/* Library shelves (Movies, TV shows, etc.) */}
            {modulesConfig.librarySections && (
              sections.length === 0 && isSectionsLoading ? (
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
              )
            )}
          </>
        )}
      </main>
    </div>
  );
}
