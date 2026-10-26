import type { EmbyItemMetadata, EmbyServer, EmbyUserData, EmbyView } from "@shared";
import { IconChevronRight } from "@tabler/icons-react";
import { memo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "../lib/i18n";
import styles from "./LibraryShelf.module.css";
import { MediaPoster, MediaPosterSkeleton } from "./MediaPoster";
import { MediaShelf } from "./MediaShelf";
import shelfClasses from "./MediaShelf.module.css";
import { Skeleton } from "./ui/Skeleton";

export interface LibraryShelfSkeletonProps {
  shelfId?: string | number;
  titleWidth?: number;
}

export function LibraryShelfSkeleton({ shelfId = "skeleton-shelf", titleWidth = 100 }: LibraryShelfSkeletonProps) {
  return (
    <MediaShelf
      title={
        <h3 className={shelfClasses.title}>
          <Skeleton width={titleWidth} radius="xs">
            <span>&nbsp;</span>
          </Skeleton>
        </h3>
      }
      itemWidth={140}
      gap={14}
    >
      {[1, 2, 3, 4, 5].map((id) => (
        <MediaPosterSkeleton key={`${shelfId}-${id}`} />
      ))}
    </MediaShelf>
  );
}

export interface LibraryShelfProps {
  view: EmbyView;
  items: EmbyItemMetadata[];
  server: EmbyServer;
  isLoading?: boolean;
  onIdentifySuccess?: (item: EmbyItemMetadata) => void;
  onUserDataChange?: (item: EmbyItemMetadata, userData: EmbyUserData) => void;
}

export const LibraryShelf = memo(function LibraryShelf({
  view,
  items,
  server,
  isLoading,
  onIdentifySuccess,
  onUserDataChange,
}: LibraryShelfProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const handleOpenSection = () => {
    navigate(`/section/${view.Id}`, { state: { name: view.Name } });
  };

  const moreLabel = t("more", "More");
  const viewAllLabel = `${t("viewAll", "View all")} ${view.Name}`;

  const moreButton = (
    <button
      type="button"
      className={styles.moreBtn}
      onClick={handleOpenSection}
      title={viewAllLabel}
      aria-label={viewAllLabel}
    >
      <span>{moreLabel}</span>
      <IconChevronRight size={14} />
    </button>
  );

  const titleNode = (
    <button type="button" className={styles.titleBtn} onClick={handleOpenSection} title={viewAllLabel}>
      <h3 className={shelfClasses.title}>{view.Name}</h3>
    </button>
  );

  if (isLoading) {
    return (
      <MediaShelf title={view.Name} rightSection={moreButton} itemWidth={140} gap={14}>
        {[1, 2, 3, 4, 5].map((id) => (
          <MediaPosterSkeleton key={`${view.Id}-${id}`} />
        ))}
      </MediaShelf>
    );
  }

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <MediaShelf title={titleNode} rightSection={moreButton} itemWidth={140} gap={14}>
      {items.map((item) => (
        <MediaPoster key={item.Id} item={item} server={server} onIdentifySuccess={onIdentifySuccess} onUserDataChange={onUserDataChange} />
      ))}
    </MediaShelf>
  );
});
