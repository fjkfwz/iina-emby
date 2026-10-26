import type { EmbyServer } from "@shared";
import { IconPlus } from "@tabler/icons-react";
import { useState } from "react";
import { useTranslation } from "../lib/i18n";
import { useIINABridge } from "../hooks/useIINABridge";
import { IINAEmbyLogo } from "./IINAEmbyLogo";
import { ServerConnectForm } from "./ServerConnectForm";
import { ServerList } from "./ServerList";
import styles from "./ServerManagement.module.css";
import { ConfirmModal } from "./ui";

interface ServerManagementProps {
  onServerSelected?: (serverId: string) => void;
}

export function ServerManagement({ onServerSelected }: ServerManagementProps) {
  const { t } = useTranslation();
  const { servers, activeServerId, selectServer, removeServer, saveServer } = useIINABridge();

  const [serverToDelete, setServerToDelete] = useState<EmbyServer | null>(null);
  const [editingServer, setEditingServer] = useState<EmbyServer | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const showForm = isAdding || editingServer !== null || servers.length === 0;

  const handleSelect = (serverId: string) => {
    selectServer(serverId);
    if (onServerSelected) {
      onServerSelected(serverId);
    }
  };

  const handleServerSaved = (server: EmbyServer) => {
    saveServer(server);
    setIsAdding(false);
    setEditingServer(null);
    if (onServerSelected) {
      onServerSelected(server.id);
    }
  };

  const handleCancelForm = () => {
    setIsAdding(false);
    setEditingServer(null);
  };

  return (
    <div className={styles.container}>
      {/* Left sidebar matching IINA welcome window */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarDragRegion} />
        <div className={styles.sidebarContent}>
          <IINAEmbyLogo size={80} />
          <h1 className={styles.sidebarTitle}>IINA</h1>
          <p className={styles.sidebarSubtitle}>Emby Browser</p>
          <span className={styles.sidebarVersion}>v{__APP_VERSION__}</span>
        </div>
      </aside>

      {/* Right content pane */}
      <main className={styles.content}>
        <div className={styles.contentDragRegion} />

        {/* Saved servers section */}
        <ServerList
          servers={servers}
          activeServerId={activeServerId}
          onSelectServer={handleSelect}
          onRequestDelete={setServerToDelete}
          onRequestEdit={(server) => {
            setIsAdding(false);
            setEditingServer(server);
          }}
        />

        {/* Add server button (placed below saved servers) */}
        {!showForm && servers.length > 0 && (
          <button
            className={styles.actionRow}
            type="button"
            onClick={() => {
              setEditingServer(null);
              setIsAdding(true);
            }}
          >
            <div className={styles.actionLeft}>
              <IconPlus size={15} stroke={2.2} />
              <span>{t("addAnotherServer", "Add Another Server...")}</span>
            </div>
            <span className={styles.shortcutGlyph}>⌘N</span>
          </button>
        )}

        {/* Connect / Edit Server Form */}
        {showForm && (
          <ServerConnectForm
            isFirstServer={servers.length === 0}
            initialServer={editingServer}
            onSuccess={handleServerSaved}
            onCancel={servers.length > 0 ? handleCancelForm : undefined}
          />
        )}
      </main>

      <ConfirmModal
        opened={serverToDelete !== null}
        onClose={() => setServerToDelete(null)}
        onConfirm={() => {
          if (serverToDelete) {
            removeServer(serverToDelete.id);
            setServerToDelete(null);
          }
        }}
        title={t("removeServer", "Remove Server")}
        message={t("removeServerConfirm", "Are you sure you want to remove '{name}'? You will need to sign in again to reconnect.").replace(
          "{name}",
          serverToDelete?.serverName || "Emby Server",
        )}
        confirmLabel={t("remove", "Remove")}
      />
    </div>
  );
}
