import type { EmbyServer } from "@shared";
import { IconEditCircle, IconServer, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "../lib/i18n";
import styles from "./ServerList.module.css";
import { Tooltip } from "./ui";

export interface ServerListProps {
  servers: EmbyServer[];
  activeServerId: string | null;
  onSelectServer: (serverId: string) => void;
  onRequestDelete: (server: EmbyServer) => void;
  onRequestEdit?: (server: EmbyServer) => void;
}

export function ServerList({ servers, activeServerId, onSelectServer, onRequestDelete, onRequestEdit }: ServerListProps) {
  const { t } = useTranslation();

  if (servers.length === 0) {
    return null;
  }

  return (
    <>
      <div className={styles.sectionHeader}>
        <span className={styles.sectionTitle}>{t("savedServers", "Saved Servers")}</span>
      </div>

      <div className={styles.serverList}>
        {servers.map((server) => {
          const isActive = server.id === activeServerId;
          return (
            <div key={server.id} className={`${styles.serverRow} ${isActive ? styles.serverRowActive : ""}`}>
              <button
                type="button"
                className={styles.serverSelectBtn}
                onClick={() => onSelectServer(server.id)}
                aria-label={`Select ${server.serverName || "Emby Server"}`}
              >
                <span className={styles.serverRowIcon}>
                  <IconServer size={18} stroke={1.8} />
                </span>
                <div className={styles.serverRowDetails}>
                  <div className={styles.serverRowNameRow}>
                    <span className={styles.serverRowName}>{server.serverName || "Emby Server"}</span>
                    {isActive && <span className={styles.activeDot} title={t("activeServer", "Active Server")} />}
                  </div>
                  <span className={styles.serverRowSub}>
                    {server.serverUrl}
                    {server.username ? ` · ${server.username}` : ""}
                  </span>
                </div>
              </button>

              <div className={styles.serverActions}>
                <Tooltip label={t("editServerTooltip", "Edit server")}>
                  <button
                    type="button"
                    className={`${styles.serverActionBtn} ${styles.editBtn}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestEdit?.(server);
                    }}
                    aria-label={t("editServerTooltip", "Edit server")}
                  >
                    <IconEditCircle size={18} stroke={1.8} />
                  </button>
                </Tooltip>

                <Tooltip label={t("removeServerTooltip", "Remove server")}>
                  <button
                    type="button"
                    className={`${styles.serverActionBtn} ${styles.deleteBtn}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onRequestDelete(server);
                    }}
                    aria-label={t("removeServerTooltip", "Remove server")}
                  >
                    <IconTrash size={18} stroke={1.8} />
                  </button>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
