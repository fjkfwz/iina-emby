import { IconSearch, IconX } from "@tabler/icons-react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useTranslation } from "../lib/i18n";
import styles from "./SearchBox.module.css";

export interface SearchBoxHandle {
  focus: () => void;
  select: () => void;
  blur: () => void;
  /** Clears the text and commits an empty query immediately. */
  clear: () => void;
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
 * Self-contained search input.
 *
 * The text the user is typing lives in local state here — never in the parent route —
 * so a keystroke only re-renders this input. The parent is notified on a debounce
 * boundary, which is what keeps typing smooth even when the page renders hundreds of
 * result cards.
 */
export const SearchBox = forwardRef<SearchBoxHandle, SearchBoxProps>(function SearchBox(
  {
    value,
    onCommit,
    onHasTextChange,
    onEscape,
    placeholder,
    ariaLabel,
    debounceMs = 250,
    autoFocus = false,
    className,
  },
  ref,
) {
  const { t } = useTranslation();
  const [text, setText] = useState<string>(() => value ?? "");
  const [hasText, setHasText] = useState<boolean>(() => (value ?? "").trim().length > 0);

  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<number | null>(null);
  /** Last query handed to the parent — used to avoid duplicate commits/navigations. */
  const committedRef = useRef<string>((value ?? "").trim());
  const hasTextRef = useRef<boolean>((value ?? "").trim().length > 0);

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

  const handleClear = useCallback(() => {
    clearTimer();
    setText("");
    applyHasText(false);
    if (committedRef.current !== "") {
      committedRef.current = "";
      onCommitRef.current("");
    }
    inputRef.current?.focus();
  }, [applyHasText, clearTimer]);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => inputRef.current?.focus(),
      select: () => inputRef.current?.select(),
      blur: () => inputRef.current?.blur(),
      clear: handleClear,
    }),
    [handleClear],
  );

  return (
    <div className={`${styles.searchBar} ${className || ""}`} onClick={() => inputRef.current?.focus()}>
      <IconSearch size={15} className={styles.searchIcon} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className={styles.searchInput}
        value={text}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
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
  );
});
