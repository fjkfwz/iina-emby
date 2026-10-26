import type { EmbySystemInfo, EmbyUser } from "@shared";
import {
  IconAlertCircle,
  IconArrowUpCircle,
  IconCheck,
  IconDeviceDesktop,
  IconFolder,
  IconLock,
  IconNetwork,
  IconPlayerPlay,
  IconServer,
  IconShieldCheck,
  IconSubtask,
  IconUser,
} from "@tabler/icons-react";
import { useCallback, useEffect, useState } from "react";
import { Alert } from "~/components/ui";
import { useIINABridge } from "~/hooks/useIINABridge";
import { fetchCurrentUser } from "~/lib/emby-auth-client";
import { fetchServerSystemInfo } from "~/lib/emby-library-client";
import { useTranslation } from "~/lib/i18n";
import styles from "./SystemInfo.module.css";
import { SystemInfoRow } from "./SystemInfoRow";
import { Button } from "./ui/Button";

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    const d = new Date(dateStr);
    return Number.isNaN(d.getTime())
      ? dateStr
      : d.toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
  } catch {
    return dateStr;
  }
}

export function SystemInfo() {
  const { activeServer } = useIINABridge();
  const { t } = useTranslation();

  const [systemInfo, setSystemInfo] = useState<EmbySystemInfo | null>(null);
  const [userInfo, setUserInfo] = useState<EmbyUser | null>(activeServer?.user || null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const loadInfo = useCallback(
    async (bypassCache = false) => {
      if (!activeServer) {
        setIsLoading(false);
        return;
      }

      setError(null);
      try {
        const [sysInfo, fetchedUser] = await Promise.all([
          fetchServerSystemInfo(activeServer, undefined, bypassCache),
          fetchCurrentUser(activeServer),
        ]);

        setSystemInfo(sysInfo);
        if (fetchedUser) {
          setUserInfo(fetchedUser);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [activeServer?.id, activeServer?.serverUrl, activeServer?.accessToken],
  );

  useEffect(() => {
    loadInfo();
  }, [loadInfo]);

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadInfo(true);
  };

  const isAdministrator = Boolean(userInfo?.Policy?.IsAdministrator);
  const canDelete = Boolean(userInfo?.Policy?.EnableContentDeletion);
  const canDownload = Boolean(userInfo?.Policy?.EnableContentDownloading);
  const canTranscode = Boolean(userInfo?.Policy?.EnableVideoPlaybackTranscoding || userInfo?.Policy?.EnableAudioPlaybackTranscoding);
  const autoPlayNext = userInfo?.Configuration?.EnableNextEpisodeAutoPlay;
  const subtitleMode = userInfo?.Configuration?.SubtitleMode;
  const introSkip = userInfo?.Configuration?.IntroSkipMode;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title={t("failedToLoadServerInfo", "Failed to load server info")} mb="md">
          {error}
        </Alert>
      )}

      {/* 1. Server Details */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("serverInformation", "Server Information")}</h2>

        <div className={styles.card}>
          <SystemInfoRow
            icon={<IconServer size={18} />}
            label={t("serverName", "Server Name")}
            loading={isLoading}
            value={systemInfo?.ServerName || activeServer?.serverName || "Emby Server"}
          />

          <SystemInfoRow
            icon={<IconServer size={18} />}
            label={t("version", "Version")}
            loading={isLoading}
            skeletonWidth="35%"
            value={systemInfo?.Version || t("unknown", "Unknown")}
          >
            {systemInfo?.HasUpdateAvailable ? (
              <span className={`${styles.badge} ${styles.badgeWarning}`}>
                <IconArrowUpCircle size={13} />
                {t("updateAvailable", "Update available")}
              </span>
            ) : systemInfo?.Version ? (
              <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                <IconCheck size={13} />
                {t("upToDate", "Up to date")}
              </span>
            ) : null}
          </SystemInfoRow>

          {(isLoading || systemInfo?.OperatingSystem || systemInfo?.OperatingSystemDisplayName) && (
            <SystemInfoRow
              icon={<IconDeviceDesktop size={18} />}
              label={t("operatingSystem", "Operating System")}
              loading={isLoading}
              skeletonWidth="40%"
              value={
                systemInfo?.OperatingSystemDisplayName && systemInfo.OperatingSystemDisplayName !== systemInfo.OperatingSystem
                  ? `${systemInfo.OperatingSystem} (${systemInfo.OperatingSystemDisplayName})`
                  : systemInfo?.OperatingSystem || "—"
              }
            />
          )}

          {systemInfo?.ProgramDataPath && (
            <SystemInfoRow
              icon={<IconFolder size={18} />}
              label={t("dataPath", "Data Path")}
              loading={isLoading}
              value={systemInfo.ProgramDataPath}
              title={systemInfo.ProgramDataPath}
            />
          )}

          {systemInfo?.TranscodingTempPath && (
            <SystemInfoRow
              icon={<IconFolder size={18} />}
              label={t("transcodingPath", "Transcoding Path")}
              loading={isLoading}
              value={systemInfo.TranscodingTempPath}
              title={systemInfo.TranscodingTempPath}
            />
          )}
        </div>
      </section>

      {/* 2. Network & Endpoints */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("networkConnectivity", "Network & Connectivity")}</h2>

        <div className={styles.card}>
          <SystemInfoRow
            icon={<IconNetwork size={18} />}
            label={t("connectedUrl", "Connected URL")}
            value={activeServer?.serverUrl || "—"}
            title={activeServer?.serverUrl}
          />

          {(isLoading || systemInfo?.LocalAddress) && (
            <SystemInfoRow
              label={t("localAddress", "Local Address")}
              loading={isLoading}
              value={systemInfo?.LocalAddress || "—"}
              title={systemInfo?.LocalAddress}
            />
          )}

          {(isLoading || systemInfo?.WanAddress) && (
            <SystemInfoRow label={t("wanAddress", "WAN Address")} loading={isLoading} value={systemInfo?.WanAddress || "—"} title={systemInfo?.WanAddress} />
          )}

          {systemInfo?.WebSocketPortNumber && (
            <SystemInfoRow label={t("webSocketPort", "WebSocket Port")} loading={isLoading} value={String(systemInfo.WebSocketPortNumber)} />
          )}
        </div>
      </section>

      {/* 3. User & Permissions */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>{t("userAccountAndPrivileges", "User Account & Privileges")}</h2>

        <div className={styles.card}>
          <SystemInfoRow
            icon={<IconUser size={18} />}
            label={t("username", "Username")}
            loading={isLoading && !userInfo}
            value={userInfo?.Name || activeServer?.username || "—"}
          >
            {isAdministrator ? (
              <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                <IconShieldCheck size={13} />
                {t("adminRole", "Admin")}
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeInfo}`}>{t("userRole", "User")}</span>
            )}
          </SystemInfoRow>

          <SystemInfoRow
            icon={<IconLock size={18} />}
            label={t("administrativeRole", "Administrative Role")}
            loading={isLoading && !userInfo}
            value={isAdministrator ? t("fullAdministrator", "Full Administrator") : t("standardUser", "Standard User")}
          />

          <SystemInfoRow
            label={t("mediaPermissions", "Media Permissions")}
            loading={isLoading && !userInfo}
            value={
              isAdministrator
                ? t("fullManageAccess", "Full Manage & Delete Access")
                : canDelete
                  ? t("allowDeleteMedia", "Allowed to Delete Media")
                  : canDownload
                    ? t("downloadAndPlayback", "Download & Playback")
                    : t("playbackOnly", "Playback Only")
            }
          />

          <SystemInfoRow label={t("transcoding", "Transcoding")} loading={isLoading && !userInfo} value={canTranscode ? t("enabled", "Enabled") : t("directPlayOnly", "Direct Play Only")} />

          {userInfo?.DateCreated && (
            <SystemInfoRow label={t("accountCreated", "Account Created")} loading={isLoading && !userInfo} value={formatDate(userInfo.DateCreated)} />
          )}

          {userInfo?.LastActivityDate && (
            <SystemInfoRow label={t("lastActivity", "Last Activity")} loading={isLoading && !userInfo} value={formatDate(userInfo.LastActivityDate)} />
          )}
        </div>
      </section>

      {/* 4. Playback & Library Preferences */}
      {(userInfo?.Configuration || isLoading) && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("userPreferences", "Emby User Preferences")}</h2>

          <div className={styles.card}>
            <SystemInfoRow
              icon={<IconPlayerPlay size={18} />}
              label={t("autoplayNextEpisode", "Auto Play Next Episode")}
              loading={isLoading && !userInfo}
              value={autoPlayNext !== undefined ? (autoPlayNext ? t("enabled", "Enabled") : t("disabled", "Disabled")) : "—"}
            />

            {subtitleMode && (
              <SystemInfoRow icon={<IconSubtask size={18} />} label={t("subtitleMode", "Subtitle Mode")} loading={isLoading && !userInfo} value={subtitleMode} />
            )}

            {introSkip && <SystemInfoRow label={t("introSkipMode", "Intro Skip Mode")} loading={isLoading && !userInfo} value={introSkip} />}

            {userInfo?.Configuration?.ResumeRewindSeconds !== undefined && (
              <SystemInfoRow
                label={t("resumeRewind", "Resume Rewind")}
                loading={isLoading && !userInfo}
                value={`${userInfo.Configuration.ResumeRewindSeconds}s`}
              />
            )}
          </div>
        </section>
      )}

      <div>
        <Button onClick={handleRefresh} glyph="⌘R" disabled={isRefreshing}>
          {isRefreshing ? t("refreshing", "Refreshing...") : t("refresh", "Refresh")}
        </Button>
      </div>
    </div>
  );
}
