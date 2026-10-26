import { IconAlertCircle, IconCheck, IconFolderSearch, IconLoader2 } from "@tabler/icons-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIINABridge } from "~/hooks/useIINABridge";
import { clearLibraryCache, type EmbyScanTaskStatus, fetchLibraryScanStatus, startLibraryScan } from "~/lib/emby-library-client";
import { useTranslation } from "~/lib/i18n";
import styles from "./LibraryScan.module.css";
import { Alert } from "./ui/Alert";
import { Button } from "./ui/Button";

const POLL_INTERVAL_MS = 1500;

export function LibraryScan() {
  const { activeServer } = useIINABridge();
  const { t } = useTranslation();
  const isAdministrator = Boolean(activeServer?.user?.Policy?.IsAdministrator);

  const [status, setStatus] = useState<EmbyScanTaskStatus | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wasRunningRef = useRef(false);

  const isRunning = status?.state === "Running" || status?.state === "Cancelling";

  const refreshStatus = useCallback(
    async (signal?: AbortSignal) => {
      if (!activeServer) return;
      try {
        const next = await fetchLibraryScanStatus(activeServer, signal);
        setStatus(next);
        const running = next?.state === "Running";
        if (wasRunningRef.current && !running) {
          // Scan finished — drop cached library data so new items show up.
          clearLibraryCache();
        }
        wasRunningRef.current = running;
      } catch (err: unknown) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [activeServer?.id, activeServer?.serverUrl, activeServer?.accessToken],
  );

  // Initial status load.
  useEffect(() => {
    if (!isAdministrator) return;
    const controller = new AbortController();
    refreshStatus(controller.signal);
    return () => controller.abort();
  }, [isAdministrator, refreshStatus]);

  // Poll while the scan is running.
  useEffect(() => {
    if (!isRunning) return;
    const controller = new AbortController();
    const id = setInterval(() => refreshStatus(controller.signal), POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      controller.abort();
    };
  }, [isRunning, refreshStatus]);

  if (!activeServer || !isAdministrator) return null;

  const onScan = async () => {
    setError(null);
    setIsStarting(true);
    try {
      await startLibraryScan(activeServer);
      wasRunningRef.current = true;
      setStatus((prev) => ({ ...(prev ?? {}), state: "Running", progress: 0 }));
      await refreshStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsStarting(false);
    }
  };

  const progress = Math.max(0, Math.min(100, status?.progress ?? 0));

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{t("libraryScanTitle", "Library Management")}</h2>

      <div className={styles.card}>
        <div className={styles.content}>
          <div className={styles.left}>
            <div className={styles.iconWrapper}>
              <IconFolderSearch size={20} />
            </div>
            <div className={styles.textGroup}>
              <div className={styles.title}>{t("libraryScanTitle", "Library Scan")}</div>
              <div className={styles.subtitle}>{t("libraryScanDesc", "Scan all libraries for new or modified media files")}</div>
            </div>
          </div>
          <div className={styles.actions}>
            <Button onClick={onScan} disabled={isStarting || isRunning}>
              {isRunning ? (
                <>
                  <IconLoader2 size={14} className={styles.spinning} />
                  <span>{t("loading", "Scanning…")}</span>
                </>
              ) : (
                t("libraryScanTitle", "Scan Library Files")
              )}
            </Button>
          </div>
        </div>

        {isRunning && (
          <div className={styles.progressContainer}>
            <div className={styles.progressRow}>
              <div className={styles.progressTrack}>
                <div className={styles.progressFill} style={{ width: `${progress}%` }} />
              </div>
              <span className={styles.progressLabel}>{progress.toFixed(0)}%</span>
            </div>
          </div>
        )}

        {!isRunning && status?.lastEndTime && (
          <div className={styles.footer}>
            <div className={styles.meta}>
              <IconCheck size={14} className={styles.metaIcon} />
              <span>
                Last scan: {new Date(status.lastEndTime).toLocaleString()}
                {status.lastStatus ? ` · ${status.lastStatus}` : ""}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className={styles.errorContainer}>
            <Alert icon={<IconAlertCircle size={16} />} title="Scan Failed">
              {error}
            </Alert>
          </div>
        )}
      </div>
    </section>
  );
}
