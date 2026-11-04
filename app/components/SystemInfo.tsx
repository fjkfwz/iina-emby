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
  IconRotate,
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
    [activeServer],
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

  const serverDisplayName = systemInfo?.ServerName || activeServer?.serverName || "Emby Server";

  return (
    <div className={styles.container}>
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title={t("failedToLoadServerInfo", "Failed to load server info")} mb="md">
          {error}
        </Alert>
      )}

      {/* Top Standout Hero Card */}
      <div className={styles.heroCard}>
        <div className={styles.heroLeft}>
          <div className={styles.heroAvatar}>
            <IconServer size={28} />
            <span className={styles.onlineDot} title={t("online", "Online")} />
          </div>
          <div className={styles.heroText}>
            <div className={styles.heroTitleRow}>
              <h1 className={styles.heroTitle}>{serverDisplayName}</h1>
              <span className={`${styles.badge} ${styles.badgeOnline}`}>
                <span className={styles.badgePulseDot} />
                <span>{t("online", "Online")}</span>
              </span>
            </div>
            <div className={styles.heroMetaRow}>
              {systemInfo?.Version && <span className={styles.heroMetaPill}>v{systemInfo.Version}</span>}
              {systemInfo?.OperatingSystem && <span className={styles.heroMetaPill}>{systemInfo.OperatingSystem}</span>}
              <span className={styles.heroMetaPill}>
                {isAdministrator ? (
                  <>
                    <IconShieldCheck size={12} color="var(--accent-teal)" />
                    <span>{t("adminRole", "Admin")}</span>
                  </>
                ) : (
                  <span>{t("userRole", "User")}</span>
                )}
              </span>
            </div>
          </div>
        </div>

        <div className={styles.heroActions}>
          <Button onClick={handleRefresh} glyph="⌘R" disabled={isRefreshing} size="sm">
            <IconRotate size={14} className={isRefreshing ? styles.spinning : ""} />
            <span>{isRefreshing ? t("refreshing", "Refreshing...") : t("refresh", "Refresh")}</span>
          </Button>
        </div>
      </div>

      {/* 2-Column Responsive Dashboard Grid */}
      <div className={styles.grid}>
        {/* 1. Server & System */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <IconDeviceDesktop size={15} className={styles.cardHeaderIcon} />
            <span>{t("serverInformation", "Server Information")}</span>
          </div>

          <SystemInfoRow
            icon={<IconServer size={16} />}
            label={t("serverName", "Server Name")}
            loading={isLoading}
            value={serverDisplayName}
          />

          <SystemInfoRow
            label={t("version", "Version")}
            loading={isLoading}
            skeletonWidth="35%"
            value={systemInfo?.Version || t("unknown", "Unknown")}
          >
            {systemInfo?.HasUpdateAvailable ? (
              <span className={`${styles.badge} ${styles.badgeWarning}`}>
                <IconArrowUpCircle size={12} />
                {t("updateAvailable", "Update available")}
              </span>
            ) : systemInfo?.Version ? (
              <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                <IconCheck size={12} />
                {t("upToDate", "Up to date")}
              </span>
            ) : null}
          </SystemInfoRow>

          {(isLoading || systemInfo?.OperatingSystem || systemInfo?.OperatingSystemDisplayName) && (
            <SystemInfoRow
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
              icon={<IconFolder size={16} />}
              label={t("dataPath", "Data Path")}
              loading={isLoading}
              value={systemInfo.ProgramDataPath}
              isCode
              copyable
            />
          )}

          {systemInfo?.TranscodingTempPath && (
            <SystemInfoRow
              icon={<IconFolder size={16} />}
              label={t("transcodingPath", "Transcoding Path")}
              loading={isLoading}
              value={systemInfo.TranscodingTempPath}
              isCode
              copyable
            />
          )}
        </div>

        {/* 2. Network & Connectivity */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <IconNetwork size={15} className={styles.cardHeaderIcon} />
            <span>{t("networkConnectivity", "Network & Connectivity")}</span>
          </div>

          <SystemInfoRow label={t("connectedUrl", "Connected URL")} value={activeServer?.serverUrl || "—"} isCode copyable />

          {(isLoading || systemInfo?.LocalAddress) && (
            <SystemInfoRow
              label={t("localAddress", "Local Address")}
              loading={isLoading}
              value={systemInfo?.LocalAddress || "—"}
              isCode
              copyable
            />
          )}

          {(isLoading || systemInfo?.WanAddress) && (
            <SystemInfoRow
              label={t("wanAddress", "WAN Address")}
              loading={isLoading}
              value={systemInfo?.WanAddress || "—"}
              isCode
              copyable
            />
          )}

          {systemInfo?.WebSocketPortNumber && (
            <SystemInfoRow
              label={t("webSocketPort", "WebSocket Port")}
              loading={isLoading}
              value={String(systemInfo.WebSocketPortNumber)}
              isCode
            />
          )}
        </div>

        {/* 3. User Account & Privileges */}
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <IconUser size={15} className={styles.cardHeaderIcon} />
            <span>{t("userAccountAndPrivileges", "User Account & Privileges")}</span>
          </div>

          <SystemInfoRow
            label={t("username", "Username")}
            loading={isLoading && !userInfo}
            value={userInfo?.Name || activeServer?.username || "—"}
          >
            {isAdministrator ? (
              <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                <IconShieldCheck size={12} />
                {t("adminRole", "Admin")}
              </span>
            ) : (
              <span className={`${styles.badge} ${styles.badgeInfo}`}>{t("userRole", "User")}</span>
            )}
          </SystemInfoRow>

          <SystemInfoRow
            icon={<IconLock size={16} />}
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

          <SystemInfoRow
            label={t("transcoding", "Transcoding")}
            loading={isLoading && !userInfo}
            value={canTranscode ? t("enabled", "Enabled") : t("directPlayOnly", "Direct Play Only")}
          />

          {userInfo?.DateCreated && (
            <SystemInfoRow
              label={t("accountCreated", "Account Created")}
              loading={isLoading && !userInfo}
              value={formatDate(userInfo.DateCreated)}
            />
          )}

          {userInfo?.LastActivityDate && (
            <SystemInfoRow
              label={t("lastActivity", "Last Activity")}
              loading={isLoading && !userInfo}
              value={formatDate(userInfo.LastActivityDate)}
            />
          )}
        </div>

        {/* 4. Playback & Library Preferences */}
        {(userInfo?.Configuration || isLoading) && (
          <div className={styles.card}>
            <div className={styles.cardHeader}>
              <IconPlayerPlay size={15} className={styles.cardHeaderIcon} />
              <span>{t("userPreferences", "Emby User Preferences")}</span>
            </div>

            <SystemInfoRow
              label={t("autoplayNextEpisode", "Auto Play Next Episode")}
              loading={isLoading && !userInfo}
              value={autoPlayNext !== undefined ? (autoPlayNext ? t("enabled", "Enabled") : t("disabled", "Disabled")) : "—"}
            />

            {subtitleMode && (
              <SystemInfoRow
                icon={<IconSubtask size={16} />}
                label={t("subtitleMode", "Subtitle Mode")}
                loading={isLoading && !userInfo}
                value={subtitleMode}
              />
            )}

            {introSkip && (
              <SystemInfoRow label={t("introSkipMode", "Intro Skip Mode")} loading={isLoading && !userInfo} value={introSkip} />
            )}

            {userInfo?.Configuration?.ResumeRewindSeconds !== undefined && (
              <SystemInfoRow
                label={t("resumeRewind", "Resume Rewind")}
                loading={isLoading && !userInfo}
                value={`${userInfo.Configuration.ResumeRewindSeconds}s`}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
