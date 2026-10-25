import { IconAlertCircle } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { ContinueWatching } from "../components/ContinueWatching";
import { FavoritesShelf } from "../components/FavoritesShelf";
import { LibraryShelf, LibraryShelfSkeleton } from "../components/LibraryShelf";
import { PageHeader } from "../components/PageHeader";
import { Alert } from "../components/ui";
import { useIINABridge, useOnWindowReopen } from "../hooks/useIINABridge";
import { useLibrarySections } from "../hooks/useLibrarySections";
import { queryClient } from "../lib/query-client";
import { embyKeys } from "../lib/query-keys";
import styles from "./home.module.css";

export function meta() {
  return [{ title: "Home - IINA Emby" }, { name: "description", content: "Emby Media Browser" }];
}

export default function HomeRoute() {
  const navigate = useNavigate();
  const { activeServer, servers, isLoading, playMedia } = useIINABridge();
  const { sections, isLoading: isSectionsLoading, error: sectionsError } = useLibrarySections(activeServer);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (!activeServer || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await queryClient.invalidateQueries({ queryKey: embyKeys.server(activeServer.id) });
    } finally {
      setIsRefreshing(false);
    }
  }, [activeServer, isRefreshing]);

  // Keep queries in memory cache when window reopens to prevent slow re-fetching;
  // Users can use the top-right Refresh button or staleTime handles updates naturally.
  useOnWindowReopen(() => {
    // Preserve cache across window refocuses
  });

  const handleIdentifySuccess = useCallback(() => {
    if (activeServer) {
      queryClient.invalidateQueries({ queryKey: embyKeys.server(activeServer.id) });
    }
  }, [activeServer]);

  // Wait for IINA bridge to report servers list before redirecting
  if (isLoading) {
    return null;
  }

  // If no server is connected or configured, redirect directly to servers page
  if (servers.length === 0 || !activeServer) {
    return <Navigate to="/servers" replace />;
  }

  const handleBack = () => {
    navigate("/servers");
  };

  return (
    <div className={styles.container}>
      <PageHeader
        onBack={handleBack}
        backTitle="Servers"
        title={activeServer.serverName || "Emby"}
        showActiveDot
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Main shelves content */}
      <main className={styles.content}>
        {/* Continue Watching shelf */}
        <ContinueWatching server={activeServer} onPlayMedia={playMedia} />

        {/* My Favorites shelf */}
        <FavoritesShelf server={activeServer} onIdentifySuccess={handleIdentifySuccess} />

        {sectionsError && (
          <Alert icon={<IconAlertCircle size={16} />} title="Error loading libraries" mb="md" mx="1.5rem">
            {sectionsError.message}
          </Alert>
        )}

        {/* Library shelves (Movies, TV shows, etc.) */}
        {sections.length === 0 && isSectionsLoading ? (
          <>
            <LibraryShelfSkeleton shelfId="init-1" titleWidth={100} />
            <LibraryShelfSkeleton shelfId="init-2" titleWidth={120} />
          </>
        ) : (
          sections.map(({ view, items, isLoading: isShelfLoading }) => (
            <LibraryShelf
              key={view.Id}
              view={view}
              items={items}
              server={activeServer}
              isLoading={isShelfLoading}
              onIdentifySuccess={handleIdentifySuccess}
            />
          ))
        )}
      </main>
    </div>
  );
}
