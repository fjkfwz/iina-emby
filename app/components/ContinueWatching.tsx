import type { EmbyServer, PlayMediaPayload } from "@shared";
import { IconAlertCircle, IconChevronRight } from "@tabler/icons-react";
import { forwardRef, useImperativeHandle } from "react";
import { useNavigate } from "react-router";
import { useContinueWatching } from "../hooks/useContinueWatching";
import shelfStyles from "./LibraryShelf.module.css";
import { MediaShelf } from "./MediaShelf";
import shelfClasses from "./MediaShelf.module.css";
import { MediaThumb, MediaThumbSkeleton } from "./MediaThumb";
import { Alert } from "./ui/Alert";

export interface ContinueWatchingProps {
  server: EmbyServer;
  onPlayMedia: (payload: PlayMediaPayload) => void;
}

export interface ContinueWatchingHandle {
  refresh: () => Promise<void>;
}

export const ContinueWatching = forwardRef<ContinueWatchingHandle, ContinueWatchingProps>(({ server, onPlayMedia }, ref) => {
  const navigate = useNavigate();
  const { items: resumeItems, loading, error, refresh } = useContinueWatching(server, 24);

  useImperativeHandle(
    ref,
    () => ({
      refresh,
    }),
    [refresh],
  );

  const handleOpenContinueWatching = () => {
    navigate("/continue-watching");
  };

  const moreButton = (
    <button
      type="button"
      className={shelfStyles.moreBtn}
      onClick={handleOpenContinueWatching}
      title="View all in Continue Watching"
      aria-label="View all in Continue Watching"
    >
      <span>More</span>
      <IconChevronRight size={14} />
    </button>
  );

  const titleNode = (
    <button type="button" className={shelfStyles.titleBtn} onClick={handleOpenContinueWatching} title="View all in Continue Watching">
      <h3 className={shelfClasses.title}>Continue Watching</h3>
    </button>
  );

  return (
    <div>
      {error && (
        <Alert icon={<IconAlertCircle size={16} />} title="Error loading items" mb="md" mx="1.5rem">
          {error}
        </Alert>
      )}

      <MediaShelf
        title={titleNode}
        rightSection={resumeItems.length > 0 || loading ? moreButton : undefined}
        itemWidth={260}
        emptyText={!loading ? "No in-progress movies or episodes right now." : undefined}
      >
        {loading && resumeItems.length === 0
          ? [1, 2, 3, 4].map((id) => <MediaThumbSkeleton key={id} />)
          : resumeItems
              .slice(0, 16)
              .map((item) => (
                <MediaThumb key={item.Id} item={item} server={server} onPlay={onPlayMedia} onUserDataChange={() => refresh()} />
              ))}
      </MediaShelf>
    </div>
  );
});

ContinueWatching.displayName = "ContinueWatching";
