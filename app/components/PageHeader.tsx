import { IconChevronLeft, IconReload, IconSearch, IconSettings2 } from "@tabler/icons-react";
import { forwardRef, type ReactNode, useEffect } from "react";
import { useLocation, useNavigate } from "react-router";
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
  className?: string;
  style?: React.CSSProperties;
}

export const PageHeader = forwardRef<HTMLElement, PageHeaderProps>(function PageHeader(
  {
    onBack,
    backTitle = "Back",
    title,
    showActiveDot = false,
    onRefresh,
    isRefreshing = false,
    centerSection,
    rightSection,
    showSettings,
    hideSearch = false,
    transparent = false,
    className,
    style,
  },
  ref,
) {
  const navigate = useNavigate();
  const location = useLocation();

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
      ref={ref}
      style={style}
      className={`${styles.header} ${transparent ? styles.transparent : ""} ${className || ""}`}
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
            title="Settings"
            aria-label="Open settings"
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
