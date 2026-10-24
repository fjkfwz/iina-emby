import type { EmbyItemMetadata, EmbyServer, EmbyUserData } from "@shared";
import { IconChevronRight } from "@tabler/icons-react";
import { memo } from "react";
import { useNavigate } from "react-router";
import { useFavorites } from "../hooks/useFavorites";
import styles from "./LibraryShelf.module.css";
import { MediaPoster, MediaPosterSkeleton } from "./MediaPoster";
import { MediaShelf } from "./MediaShelf";
import shelfClasses from "./MediaShelf.module.css";

export interface FavoritesShelfProps {
  server: EmbyServer;
  onIdentifySuccess?: (item: EmbyItemMetadata) => void;
  onUserDataChange?: (item: EmbyItemMetadata, userData: EmbyUserData) => void;
}

export const FavoritesShelf = memo(function FavoritesShelf({
  server,
  onIdentifySuccess,
  onUserDataChange,
}: FavoritesShelfProps) {
  const navigate = useNavigate();
  const { items, loading, refetch } = useFavorites(server);

  const handleOpenSection = () => {
    navigate("/section/favorites", { state: { name: "我的收藏" } });
  };

  const moreButton = (
    <button
      type="button"
      className={styles.moreBtn}
      onClick={handleOpenSection}
      title="查看所有我的收藏"
      aria-label="查看所有我的收藏"
    >
      <span>More</span>
      <IconChevronRight size={14} />
    </button>
  );

  const titleNode = (
    <button type="button" className={styles.titleBtn} onClick={handleOpenSection} title="查看所有我的收藏">
      <h3 className={shelfClasses.title}>我的收藏</h3>
    </button>
  );

  if (loading && items.length === 0) {
    return (
      <MediaShelf title="我的收藏" rightSection={moreButton} itemWidth={140} gap={14}>
        {[1, 2, 3, 4, 5].map((id) => (
          <MediaPosterSkeleton key={`fav-skel-${id}`} />
        ))}
      </MediaShelf>
    );
  }

  if (!loading && items.length === 0) {
    return null;
  }

  return (
    <MediaShelf title={titleNode} rightSection={items.length > 5 ? moreButton : undefined} itemWidth={140} gap={14}>
      {items.map((item) => (
        <MediaPoster
          key={item.Id}
          item={item}
          server={server}
          onIdentifySuccess={onIdentifySuccess}
          onUserDataChange={(updatedItem, data) => {
            refetch();
            onUserDataChange?.(updatedItem, data);
          }}
        />
      ))}
    </MediaShelf>
  );
});
