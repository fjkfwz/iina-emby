import { IconSearch } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router";
import { PageHeader } from "../components/PageHeader";
import { SearchBox, type SearchBoxHandle } from "../components/SearchBox";
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
  const searchBoxRef = useRef<SearchBoxHandle>(null);

  const { activeServer, isLoading } = useIINABridge();

  const urlQ = searchParams.get("q") || "";

  /** Query that actually drives the results request (updated on the debounce boundary). */
  const [query, setQuery] = useState<string>(urlQ);
  /** Switches between the empty state and the results view — flips on the first keystroke. */
  const [isSearching, setIsSearching] = useState<boolean>(urlQ.trim().length > 0);
  /** Mirrors the `?q=` param so we never navigate to the URL we are already on. */
  const committedRef = useRef<string>(urlQ);

  // Adopt URL changes coming from outside the box (back/forward, deep links)
  useEffect(() => {
    if (urlQ === committedRef.current) return;
    committedRef.current = urlQ;
    setQuery(urlQ);
    setIsSearching(urlQ.trim().length > 0);
  }, [urlQ]);

  // Global keyboard shortcut: Cmd+F or '/' to focus the search input
  useEffect(() => {
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
  }, []);

  const handleCommit = useCallback(
    (nextQuery: string) => {
      setQuery(nextQuery);
      setIsSearching(nextQuery.length > 0);

      if (nextQuery === committedRef.current) return;
      const previousQuery = committedRef.current;
      committedRef.current = nextQuery;

      if (nextQuery) {
        // Push a history entry only on idle -> searching, so Back returns to the empty page
        setSearchParams({ q: nextQuery }, { replace: Boolean(previousQuery) });
      } else {
        setSearchParams({}, { replace: true });
      }
    },
    [setSearchParams],
  );

  const handleEscape = useCallback(
    (hasText: boolean) => {
      if (hasText) {
        searchBoxRef.current?.clear();
        return;
      }
      if (window.history.length > 1) {
        navigate(-1);
      } else {
        navigate("/");
      }
    },
    [navigate],
  );

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
          <SearchBox
            ref={searchBoxRef}
            value={urlQ}
            onCommit={handleCommit}
            onHasTextChange={setIsSearching}
            onEscape={handleEscape}
            autoFocus
            ariaLabel={t("search", "Search")}
          />
        }
      />

      <main className={styles.content}>
        {isSearching ? (
          <SearchResultsView server={activeServer} query={query} />
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
