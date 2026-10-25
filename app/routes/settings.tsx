import {
  IconBookmarks,
  IconBug,
  IconChevronRight,
  IconDeviceTv,
  IconFlame,
  IconFolders,
  IconLayoutGrid,
  IconPlayerPlay,
  IconPlayerTrackNext,
  IconRotate,
  IconServer,
  IconSubtitles,
  IconWorld,
} from "@tabler/icons-react";
import type React from "react";
import { useNavigate } from "react-router";
import { LibraryScan } from "~/components/LibraryScan";
import { PageHeader } from "~/components/PageHeader";
import { useHomeModulesConfig } from "~/hooks/useHomeModulesConfig";
import { useIINABridge } from "~/hooks/useIINABridge";
import { SUPPORTED_LANGUAGES, type LanguageCode, useTranslation } from "~/lib/i18n";
import styles from "./settings.module.css";

export function meta() {
  return [{ title: "Settings - IINA Emby" }];
}

interface ToggleSwitchProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

function ToggleSwitch({ id, checked, onChange, disabled }: ToggleSwitchProps) {
  return (
    <label className={styles.switch} htmlFor={id}>
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className={styles.slider} />
    </label>
  );
}

export default function SettingsRoute() {
  const navigate = useNavigate();
  const { language, setLanguage, t } = useTranslation();
  const { config: modulesConfig, toggleModule } = useHomeModulesConfig();
  const { preferences, setPreference, servers, activeServer } = useIINABridge();

  return (
    <>
      <PageHeader
        onBack={() => navigate("/")}
        backTitle={t("back", "Back")}
        className={styles.pageHeader}
        title={t("settingsTitle", "Settings")}
      />

      <div className={styles.container}>
        {/* Language Selection */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("generalSection", "General & Interface")}</h2>
          <div className={styles.card}>
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconWorld size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("interfaceLanguage", "Interface Language")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("interfaceLanguageDesc", "Switch display language instantly without app restart")}
                  </span>
                </div>
              </div>
            </div>

            <div className={styles.divider} />

            <div className={styles.languageGrid}>
              {SUPPORTED_LANGUAGES.map((lang) => {
                const isActive = language === lang.code;
                return (
                  <button
                    key={lang.code}
                    type="button"
                    className={`${styles.langCard} ${isActive ? styles.langCardActive : ""}`}
                    onClick={() => setLanguage(lang.code as LanguageCode)}
                  >
                    <span className={styles.langNative}>{lang.nativeLabel}</span>
                    <span className={styles.langCode}>{lang.code}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* Home Page Modules */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("homeModulesSection", "Home Page Modules")}</h2>
          <div className={styles.card}>
            {/* Hero Banner */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconFlame size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("moduleHero", "Featured Hero Banner")}</span>
                  <span className={styles.rowSubtitle}>{t("moduleHeroDesc", "Top carousel spotlight with quick play")}</span>
                </div>
              </div>
              <ToggleSwitch
                id="toggle-hero"
                checked={modulesConfig.hero}
                onChange={() => toggleModule("hero")}
              />
            </div>

            <div className={styles.divider} />

            {/* Categories */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconLayoutGrid size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("moduleCategories", "Categories Quick Shelf")}</span>
                  <span className={styles.rowSubtitle}>{t("moduleCategoriesDesc", "Quick navigation for Movies, TV, Anime")}</span>
                </div>
              </div>
              <ToggleSwitch
                id="toggle-categories"
                checked={modulesConfig.categories}
                onChange={() => toggleModule("categories")}
              />
            </div>

            <div className={styles.divider} />

            {/* Continue Watching */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconPlayerPlay size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("moduleContinueWatching", "Continue Watching")}</span>
                  <span className={styles.rowSubtitle}>{t("moduleContinueWatchingDesc", "In-progress titles with instant resume")}</span>
                </div>
              </div>
              <ToggleSwitch
                id="toggle-continue-watching"
                checked={modulesConfig.continueWatching}
                onChange={() => toggleModule("continueWatching")}
              />
            </div>

            <div className={styles.divider} />

            {/* Favorites */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconBookmarks size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("moduleFavorites", "Favorites Shelf")}</span>
                  <span className={styles.rowSubtitle}>{t("moduleFavoritesDesc", "Items marked as personal favorites")}</span>
                </div>
              </div>
              <ToggleSwitch
                id="toggle-favorites"
                checked={modulesConfig.favorites}
                onChange={() => toggleModule("favorites")}
              />
            </div>

            <div className={styles.divider} />

            {/* Library Sections */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconFolders size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("moduleLibrarySections", "Library Sections")}</span>
                  <span className={styles.rowSubtitle}>{t("moduleLibrarySectionsDesc", "Latest additions and popular items from libraries")}</span>
                </div>
              </div>
              <ToggleSwitch
                id="toggle-library-sections"
                checked={modulesConfig.librarySections}
                onChange={() => toggleModule("librarySections")}
              />
            </div>
          </div>
        </section>

        {/* Startup & Playback Behavior */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("playbackSection", "Startup & Playback")}</h2>
          <div className={styles.card}>
            {/* Auto Open on Launch */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconDeviceTv size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("autoOpenOnLaunch", "Auto-launch Emby Browser on IINA startup")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("autoOpenOnLaunchDesc", "Automatically open the standalone Emby browser window when IINA starts")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-auto-open-on-launch"
                checked={preferences.auto_open_on_launch !== false}
                onChange={(val) => setPreference("auto_open_on_launch", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Open in New Window */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconPlayerPlay size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("openInNewWindow", "Open playback in a new window")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("openInNewWindowDesc", "Create a separate player instance whenever media is played")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-open-new-window"
                checked={Boolean(preferences.open_in_new_window)}
                onChange={(val) => setPreference("open_in_new_window", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Sync Playback Progress */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconRotate size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("syncPlaybackProgress", "Sync playback progress to Emby")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("syncPlaybackProgressDesc", "Report playback position in real time to keep resume states synchronized")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-sync-progress"
                checked={preferences.sync_playback_progress !== false}
                onChange={(val) => setPreference("sync_playback_progress", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Reopen Browser on Playback End */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconDeviceTv size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("reopenBrowserOnEnd", "Reopen browser on playback finish")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("reopenBrowserOnEndDesc", "Bring back the Emby browser window when video finishes or closes")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-reopen-browser"
                checked={preferences.reopen_browser_on_playback_end !== false}
                onChange={(val) => setPreference("reopen_browser_on_playback_end", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Autoplay Next Episode */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconPlayerTrackNext size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("autoplayNextEpisode", "Autoplay next episode")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("autoplayNextEpisodeDesc", "Automatically buffer and start the next episode when current ends")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-autoplay-next"
                checked={preferences.autoplay_next_episode !== false}
                onChange={(val) => setPreference("autoplay_next_episode", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Auto Download Subtitles */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconSubtitles size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("autoDownloadSubtitles", "Auto-download external subtitles")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("autoDownloadSubtitlesDesc", "Automatically fetch and load external subtitle streams")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-auto-download-sub"
                checked={preferences.auto_download_enabled !== false}
                onChange={(val) => setPreference("auto_download_enabled", val)}
              />
            </div>

            <div className={styles.divider} />

            {/* Debug Logging */}
            <div className={styles.settingRow}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconBug size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("debugLogging", "Verbose debug logging")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("debugLoggingDesc", "Output detailed diagnostic logs for troubleshooting")}
                  </span>
                </div>
              </div>
              <ToggleSwitch
                id="pref-debug-logging"
                checked={Boolean(preferences.debug_logging)}
                onChange={(val) => setPreference("debug_logging", val)}
              />
            </div>
          </div>
        </section>

        {/* Server & Diagnostics */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("serverSection", "Server & Diagnostics")}</h2>
          <div className={styles.card}>
            {/* Servers management */}
            <button type="button" className={styles.rowButton} onClick={() => navigate("/servers")}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconServer size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("connectedServers", "Connected Servers")}</span>
                  <span className={styles.rowSubtitle}>
                    {activeServer
                      ? `${activeServer.serverName || activeServer.serverUrl} (${servers.length} configured)`
                      : `${servers.length} configured`}
                  </span>
                </div>
              </div>
              <IconChevronRight size={16} className={styles.chevron} />
            </button>

            <div className={styles.divider} />

            {/* System Info */}
            <button type="button" className={styles.rowButton} onClick={() => navigate("/system-info")}>
              <div className={styles.rowLeft}>
                <span className={styles.rowIcon}>
                  <IconServer size={18} />
                </span>
                <div className={styles.textGroup}>
                  <span className={styles.rowTitle}>{t("systemInfoTitle", "System Information")}</span>
                  <span className={styles.rowSubtitle}>
                    {t("systemInfoDesc", "View server version, network endpoints, and user permissions")}
                  </span>
                </div>
              </div>
              <IconChevronRight size={16} className={styles.chevron} />
            </button>
          </div>
        </section>

        {/* Library Scan */}
        <LibraryScan />

        {/* Version & About */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>{t("versionInfo", "About & Version")}</h2>
          <div className={`${styles.card} ${styles.aboutCard}`}>
            <div className={styles.aboutRow}>
              <span className={styles.aboutLabel}>{t("appVersion", "Plugin Version")}</span>
              <span className={styles.aboutValue}>v0.6.2</span>
            </div>
            <div className={styles.aboutRow}>
              <span className={styles.aboutLabel}>IINA Platform</span>
              <span className={styles.aboutValue}>macOS Native Player Bridge</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
