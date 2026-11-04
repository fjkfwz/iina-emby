import { IconClock, IconHistory, IconSearch, IconTrash, IconX } from "@tabler/icons-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "../lib/i18n";
import { useSearchHistory } from "../lib/search-history";
import styles from "./SearchBox.module.css";

export interface SearchBoxHandle {
  focus: () => void;
  select: () => void;
  blur: () => void;
  /** Clears the text and commits an empty query immediately. */
  clear: () => void;
  /** Sets the input text directly. */
  setValue: (value: string) => void;
}

export interface SearchBoxProps {
  /**
   * Externally driven query (e.g. the `?q=` URL param).
   * When this changes to a value the box did not emit itself, the box adopts it
   * (browser back/forward, deep links) without echoing a second commit.
   */
  value?: string;
  /** Called with the trimmed query once the user pauses typing (or presses Enter). */
  onCommit: (query: string) => void;
  /** Called immediately when the box flips between empty and non-empty. */
  onHasTextChange?: (hasText: boolean) => void;
  /** Escape key. `hasText` tells the caller whether there is something to clear. */
  onEscape?: (hasText: boolean) => void;
  placeholder?: string;
  ariaLabel?: string;
  debounceMs?: number;
  autoFocus?: boolean;
  className?: string;
}

/**
 * Self-contained search input with recent search history popup.
 *
 * The text the user is typing lives in local state here — never in the parent route —
 * so a keystroke only re-renders this input. The parent is notified on a debounce
 * boundary, which is what keeps typing smooth even when the page renders hundreds of
 * result cards.
 */
export const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>(function SearchBox(
  { value, onCommit, onHasTextChange, onEscape, placeholder, ariaLabel, debounceMs = 250, autoFocus = false, className },
  ref,
) {
  const { t } = useTranslation();
  const [text, setText] = useState<string>(() => value ?? "");
  const [hasText, setHasText] = useState<boolean>(() => (value ?? "").trim().length > 0);
  const [isOpen, setIsOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  /** Last query handed to the parent — used to avoid duplicate commits/navigations. */
  const committedRef = useRef<string>((value ?? "").trim());
  const hasTextRef = useRef<boolean>((value ?? "").trim().length > 0);

  const { history, removeSearch, clearHistory } = useSearchHistory();

  const onCommitRef = useRef(onCommit);
  onCommitRef.current = onCommit;
  const onHasTextChangeRef = useRef(onHasTextChange);
  onHasTextChangeRef.current = onHasTextChange;

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => () => clearTimer(), [clearTimer]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const applyHasText = useCallback((next: boolean) => {
    if (hasTextRef.current === next) return;
    hasTextRef.current = next;
    setHasText(next);
    onHasTextChangeRef.current?.(next);
  }, []);

  const commitNow = useCallback(
    (raw: string) => {
      clearTimer();
      const q = raw.trim();
      setIsOpen(false);
      if (q === committedRef.current) return;
      committedRef.current = q;
      onCommitRef.current(q);
    },
    [clearTimer],
  );

  // Adopt a query that came from outside (URL param, back/forward navigation).
  useEffect(() => {
    if (value === undefined) return;
    const next = value.trim();
    if (next === committedRef.current) return;
    clearTimer();
    committedRef.current = next;
    setText(value);
    applyHasText(next.length > 0);
  }, [value, clearTimer, applyHasText]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [autoFocus]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setText(next);
      applyHasText(next.trim().length > 0);
      setIsOpen(true);
      clearTimer();
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const q = next.trim();
        if (q === committedRef.current) return;
        committedRef.current = q;
        onCommitRef.current(q);
      }, debounceMs);
    },
    [applyHasText, clearTimer, debounceMs],
  );

  const handleSelectHistoryItem = useCallback(
    (query: string) => {
      clearTimer();
      setText(query);
      applyHasText(true);
      setIsOpen(false);
      committedRef.current = query;
      onCommitRef.current(query);
      inputRef.current?.focus();
    },
    [clearTimer, applyHasText],
  );

  const handleClear = useCallback(() => {
    clearTimer();
    setText("");
    applyHasText(false);
    if (committedRef.current !== "") {
      committedRef.current = "";
      onCommitRef.current("");
    }
    setIsOpen(true);
    inputRef.current?.focus();
  }, [applyHasText, clearTimer]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => {
        inputRef.current?.focus();
        setIsOpen(true);
      },
      select: () => inputRef.current?.select(),
      blur: () => inputRef.current?.blur(),
      clear: handleClear,
      setValue: (newVal: string) => {
        clearTimer();
        setText(newVal);
        applyHasText(newVal.trim().length > 0);
        setIsOpen(false);
      },
    }),
    [handleClear, clearTimer, applyHasText],
  );

  const filteredHistory = text.trim()
    ? history.filter((item) => item.toLowerCase().includes(text.trim().toLowerCase())).slice(0, 10)
    : history.slice(0, 10);

  return (
    <div ref={containerRef} className={`${styles.searchContainer} ${className || ""}`}>
      <div className={styles.searchBar}>
        <IconSearch size={15} className={styles.searchIcon} aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          className={styles.searchInput}
          value={text}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onClick={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              if (isOpen) {
                setIsOpen(false);
                return;
              }
              onEscape?.(text.trim().length > 0);
              return;
            }
            if (e.key === "Enter") {
              e.preventDefault();
              commitNow(text);
            }
          }}
          placeholder={placeholder ?? t("searchPlaceholder", "Search movies, TV series, episodes...")}
          aria-label={ariaLabel ?? t("search", "Search")}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />
        {hasText ? (
          <button
            type="button"
            className={styles.searchClearBtn}
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
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

      {isOpen && filteredHistory.length > 0 && (
        <div className={styles.dropdown}>
          <div className={styles.dropdownHeader}>
            <div className={styles.dropdownTitle}>
              <IconHistory size={13} stroke={2} className={styles.dropdownTitleIcon} />
              <span>{t("recentSearches", "Recent Searches")}</span>
            </div>
            <button
              type="button"
              className={styles.clearAllBtn}
              onClick={(e) => {
                e.stopPropagation();
                clearHistory();
              }}
              onMouseDown={(e) => e.preventDefault()}
            >
              <IconTrash size={12} stroke={1.8} />
              <span>{t("clearSearchHistory", "Clear All")}</span>
            </button>
          </div>

          <ul className={styles.historyList}>
            {filteredHistory.map((item) => (
              <li key={item} className={styles.historyItem}>
                <button
                  type="button"
                  className={styles.historyItemSelectBtn}
                  onClick={() => handleSelectHistoryItem(item)}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <IconClock size={14} className={styles.historyItemIcon} />
                  <span className={styles.historyItemText}>{item}</span>
                </button>
                <button
                  type="button"
                  className={styles.deleteItemBtn}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeSearch(item);
                  }}
                  onMouseDown={(e) => e.preventDefault()}
                  title={t("deleteSearchHistoryItem", "Delete")}
                  aria-label={`${t("deleteSearchHistoryItem", "Delete")} ${item}`}
                >
                  <IconX size={13} stroke={2} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
});
