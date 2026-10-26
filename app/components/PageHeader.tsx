import { IconChevronLeft, IconReload, IconSearch, IconSettings2 } from "@tabler/icons-react";
import { forwardRef, type ReactNode, useCallback, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "../lib/i18n";
import styles from "./PageHeader.module.css";
import { GlassElement } from "./ui/GlassElement";

export interface PageHeaderProps {
  onBack?: () => void;
  backTitle?: string;
  title?: ReactNode;
  showActiveDot?: boolean;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  centerSection?: ReactNode;
  rightSection?: ReactNode;
  showSettings?: boolean;
  hideSearch?: boolean;
  transparent?: boolean;
  shadowOnScroll?: boolean;
  forceShadow?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  {
    onBack,
    backTitle: backTitleProp,
    title,
    showActiveDot = false,
    onRefresh,
    isRefreshing = false,
    centerSection,
    rightSection,
    showSettings,
    hideSearch = false,
    transparent = false,
    shadowOnScroll = false,
    forceShadow = false,
    className,
    style,
  },
  ref,
) {
  const { t } = useTranslation();
  const backTitle = backTitleProp || t("back", "Back");
  const navigate = useNavigate();
  const location = useLocation();
  const internalRef = useRef<HTMLElement | null>(null);

  const setHeaderRef = useCallback(
    (node: HTMLElement | null) => {
      internalRef.current = node;
      if (typeof ref === "function") {
        ref(node);
      } else if (ref) {
        (ref as React.MutableRefObject<HTMLElement | null>).current = node;
      }
    },
    [ref],
  );

  useEffect(() => {
    if (!shadowOnScroll) return;

    const rootEl = document.getElementById("root");
    let rafId: number | null = null;
    let lastProgress: number | null = null;

    const updateHeader = (top: number) => {
      if (!internalRef.current) return;
      if (forceShadow) {
        if (lastProgress !== 1) {
          internalRef.current.style.setProperty("--header-shadow-opacity", "1");
          lastProgress = 1;
        }
        return;
      }
      // Smooth gradient fade: 0 at top, smoothly scaling to 1.0 as the page scrolls down (over 100px)
      // When scrolling back up, it gradually fades out smoothly.
      const progress = Math.min(1, Math.max(0, top / 100));
      const rounded = Math.round(progress * 100) / 100;
      if (lastProgress !== rounded) {
        lastProgress = rounded;
        internalRef.current.style.setProperty("--header-shadow-opacity", rounded.toString());
      }
    };

    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const top = rootEl ? rootEl.scrollTop : window.scrollY;
        updateHeader(top);
      });
    };

    if (rootEl) {
      rootEl.addEventListener("scroll", handleScroll, { passive: true });
    }
    window.addEventListener("scroll", handleScroll, { passive: true });

    // Initial sync
    const initialTop = rootEl ? rootEl.scrollTop : window.scrollY;
    updateHeader(initialTop);

    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (rootEl) {
        rootEl.removeEventListener("scroll", handleScroll);
      }
      window.removeEventListener("scroll", handleScroll);
    };
  }, [shadowOnScroll, forceShadow]);

  const isSettingsRoute = location.pathname === "/settings" || location.pathname === "/system-info";
  const shouldShowSettings = showSettings ?? !isSettingsRoute;
  const canSearch = !isSettingsRoute && location.pathname !== "/search";

  useEffect(() => {
    if (!canSearch || hideSearch) return;
    const handleKey = (e: KeyboardEvent) => {
      const target = document.activeElement as HTMLElement | null;
      const isInput = target?.tagName === "INPUT" || target?.tagName === "TEXTAREA";
      if ((e.metaKey && e.key.toLowerCase() === "f") || (e.key === "/" && !isInput)) {
        e.preventDefault();
        navigate("/search");
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [canSearch, hideSearch, navigate]);

  return (
    <header
      ref={setHeaderRef}
      style={style}
      className={`${styles.header} ${transparent ? styles.transparent : ""} ${shadowOnScroll ? styles.shadowOnScroll : ""} ${className || ""}`}
      data-window-drag
    >
      <div className={styles.headerLeft}>
        {onBack && (
          <GlassElement variant="glass" shape="rounded" size="sm" isIconOnly onClick={onBack} title={backTitle} aria-label={backTitle}>
            <IconChevronLeft size={18} />
          </GlassElement>
        )}

        {title && (
          <GlassElement
            as="div"
            variant="glass"
            shape="rounded"
            size="sm"
            interactive={false}
            leftSection={showActiveDot ? <span className={styles.activeDot} /> : undefined}
            className={styles.badge}
          >
            {typeof title === "string" ? <span className={styles.titleText}>{title}</span> : title}
          </GlassElement>
        )}
      </div>

      {centerSection && <div className={styles.headerCenter}>{centerSection}</div>}

      <div className={styles.headerRight}>
        {canSearch && !hideSearch && (
          <GlassElement
            variant="glass"
            shape="rounded"
            size="sm"
            isIconOnly
            title="Search (Cmd+F)"
            aria-label="Search"
            onClick={() => {
              navigate("/search");
            }}
          >
            <IconSearch size={16} />
          </GlassElement>
        )}

        {shouldShowSettings && (
          <GlassElement
            variant="glass"
            shape="rounded"
            size="sm"
            isIconOnly
            title={t("settings", "Settings")}
            aria-label={t("settings", "Settings")}
            onClick={() => {
              navigate("/settings");
            }}
          >
            <IconSettings2 size={16} />
          </GlassElement>
        )}

        {rightSection}

        {onRefresh && (
          <GlassElement
            variant="glass"
            shape="rounded"
            size="sm"
            isIconOnly
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Refresh"
            aria-label="Refresh content"
          >
            <IconReload size={16} className={isRefreshing ? styles.spinning : ""} />
          </GlassElement>
        )}
      </div>
    </header>
  );
});
