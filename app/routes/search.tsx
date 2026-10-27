import { IconSearch, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { SearchResultsView } from "../components/SearchResultsView";
import { useIINABridge } from "../hooks/useIINABridge";
import { useTranslation } from "../lib/i18n";
import styles from "./search.module.css";

export function meta() {
  return [{ title: "Search - Emby Browser" }, { name: "description", content: "Search library" }];
}

export default function SearchRoute() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { activeServer, isLoading } = useIINABridge();

  const urlQ = searchParams.get("q") || "";
  const prevQRef = useRef(urlQ);

  const [searchQuery, setSearchQuery] = useState<string>(() => urlQ);
  const [debouncedQuery, setDebouncedQuery] = useState<string>(() => urlQ);

  // Synchronize internal state when URL param 'q' changes externally
  useEffect(() => {
    if (urlQ !== searchQuery) {
      setSearchQuery(urlQ);
      setDebouncedQuery(urlQ);
      prevQRef.current = urlQ;
    }
  }, [urlQ]);

  // Auto-focus and select search input on mount
  useEffect(() => {
    searchInputRef.current?.focus();
    searchInputRef.current?.select();
  }, []);

  // Debounce search query and sync to URL search params
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const q = searchQuery.trim();
      setDebouncedQuery(q);
      const prevQ = prevQRef.current;
      if (q) {
        const shouldReplace = Boolean(prevQ);
        setSearchParams({ q }, { replace: shouldReplace });
        prevQRef.current = q;
      } else {
        setSearchParams({}, { replace: true });
        prevQRef.current = "";
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

  const handleClearSearch = useCallback(() => {
    setSearchQuery("");
    setDebouncedQuery("");
    setSearchParams({}, { replace: true });
    prevQRef.current = "";
    searchInputRef.current?.focus();
  }, [setSearchParams]);

  const handleBack = useCallback(() => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate("/");
    }
  }, [navigate]);

  if (!activeServer && !isLoading) {
    return <Navigate to="/servers" replace />;
  }

  if (!activeServer) {
    return null;
  }

  const isSearching = Boolean(searchQuery.trim());

  return (
    <div className={styles.container}>
      <PageHeader
        onBack={handleBack}
        backTitle={t("back", "Back")}
        title={t("search", "Search")}
        hideSearch
        shadowOnScroll
        forceShadow={isSearching}
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
                  if (searchQuery) {
                    handleClearSearch();
                  } else {
                    handleBack();
                  }
                }
              }}
              placeholder={t("searchPlaceholder", "Search movies, TV series, episodes...")}
              aria-label={t("search", "Search")}
            />
            {searchQuery ? (
              <button
                type="button"
                className={styles.searchClearBtn}
                onClick={(e) => {
                  e.stopPropagation();
                  handleClearSearch();
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

      <main className={styles.content}>
        {debouncedQuery.trim() ? (
          <SearchResultsView server={activeServer} query={debouncedQuery} />
        ) : (
          <div className={styles.emptyState}>
            <IconSearch size={54} className={styles.emptyIcon} stroke={1.4} />
            <div className={styles.emptyTitle}>
              {t("searchPlaceholder", "Search movies, TV series, episodes...")}
            </div>
            <div className={styles.emptyDesc}>
              {t("searchEmptyDesc", "Try checking your spelling or searching for another title.")}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
