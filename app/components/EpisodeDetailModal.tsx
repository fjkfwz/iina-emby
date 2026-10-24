import { type EmbyItemMetadata, formatEpisodeCode } from "@shared";
import { IconPlayerPlayFilled } from "@tabler/icons-react";
import styles from "./EpisodeDetailModal.module.css";
import { GlassElement } from "./ui/GlassElement";
import { Modal } from "./ui/Modal";

export interface EpisodeDetailModalProps {
  episode: EmbyItemMetadata | null;
  onClose: () => void;
  onPlay?: (episode: EmbyItemMetadata) => void;
}

export function EpisodeDetailModal({ episode, onClose, onPlay }: EpisodeDetailModalProps) {
  return (
    <Modal
      opened={Boolean(episode)}
      onClose={onClose}
      size="28rem"
      withCloseButton={true}
      classNames={{
        content: styles.modalContent,
      }}
    >
      {episode && (
        <div className={styles.modalBody}>
          <div className={styles.modalHeader}>
            <div className={styles.modalHeaderInfo}>
              <div className={styles.modalEpisodeCode}>{formatEpisodeCode(episode.ParentIndexNumber, episode.IndexNumber)}</div>
              <h3 className={styles.modalEpisodeTitle}>{episode.Name || "Episode"}</h3>
            </div>
            {onPlay && (
              <GlassElement
                variant="primary"
                size="sm"
                shape="rounded"
                onClick={() => {
                  onClose();
                  onPlay(episode);
                }}
                leftSection={<IconPlayerPlayFilled size={14} />}
              >
                <span>播放</span>
              </GlassElement>
            )}
          </div>

          <div className={styles.modalOverviewScroll}>
            <p className={styles.modalOverviewText}>{episode.Overview || "No overview available for this episode."}</p>
          </div>
        </div>
      )}
    </Modal>
  );
}
