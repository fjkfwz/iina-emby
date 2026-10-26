import { IconAlertCircle } from "@tabler/icons-react";
import { useCallback } from "react";
import { Navigate, useNavigate } from "react-router";
import { MediaThumb, MediaThumbSkeleton } from "../components/MediaThumb";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui";
import { useContinueWatching } from "../hooks/useContinueWatching";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useProgressiveScroll } from "../hooks/useProgressiveScroll";
import { useTranslation } from "../lib/i18n";
import styles from "./continue-watching.module.css";

const PAGE_SIZE = 24;

export function meta() {
  return [{ title: "Continue Watching - IINA Emby" }, { name: "description", content: "Continue watching media" }];
}

export default function ContinueWatchingRoute() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { activeServer, servers, isLoading: isBridgeLoading, playMedia } = useIINABridge();

  const { items, loading: isLoading, error, refresh } = useContinueWatching(activeServer, 10000);

  const { visibleItems, hasMore, sentinelRef } = useProgressiveScroll({
    items,
    pageSize: PAGE_SIZE,
  });

  const handleRefresh = useCallback(() => {
    return refresh();
  }, [refresh]);

  useOnWindowReopen(() => {
    handleRefresh();
  });

  if (isBridgeLoading) {
    return null;
  }

  if (servers.length === 0 || !activeServer) {
    return <Navigate to="/servers" replace />;
  }

  const handleBack = () => {
    navigate("/");
  };

  const totalCount = items.length;

  const titleNode = (
    <span>
      {t("continueWatching", "Continue Watching")}
      {totalCount > 0 && <span className={styles.countBadge}>({totalCount})</span>}
    </span>
  );

  return (
    <div className={styles.container}>
      <PageHeader
        onBack={handleBack}
        backTitle={t("home", "Home")}
        title={titleNode}
        onRefresh={handleRefresh}
        isRefreshing={isLoading && items.length > 0}
      />

      <main className={styles.content}>
        {error && <Alert icon={<IconAlertCircle size={18} />}>{error}</Alert>}

        {isLoading && items.length === 0 ? (
          <div className={styles.grid}>
            {Array.from({ length: 8 }).map((_, index) => (
              <MediaThumbSkeleton key={`skeleton-${index}`} />
            ))}
          </div>
        ) : items.length === 0 && !error ? (
          <div className={styles.emptyState}>
            <p>{t("noInProgress", "No in-progress movies or episodes right now.")}</p>
          </div>
        ) : (
          <>
            <div className={styles.grid}>
              {visibleItems.map((item) => (
                <MediaThumb key={item.Id} item={item} server={activeServer} onPlay={playMedia} onUserDataChange={() => handleRefresh()} />
              ))}
              {hasMore && Array.from({ length: 4 }).map((_, index) => <MediaThumbSkeleton key={`more-skeleton-${index}`} />)}
            </div>

            {hasMore && <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />}
          </>
        )}
      </main>
    </div>
  );
}
