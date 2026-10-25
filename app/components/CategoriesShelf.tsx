import type { EmbyServer, EmbyView } from "@shared";
import { getItemImageUrl } from "@shared";
import { IconDeviceTv, IconFolder, IconMovie } from "@tabler/icons-react";
import { memo, useState } from "react";
import { useNavigate } from "react-router";
import { useUserViews } from "../hooks/useUserViews";
import styles from "./CategoriesShelf.module.css";
import { MediaShelf } from "./MediaShelf";
import shelfClasses from "./MediaShelf.module.css";
import { Skeleton } from "./ui/Skeleton";

export function CategoryCardSkeleton() {
  return (
    <div className={styles.card} aria-hidden="true">
      <div className={styles.preview}>
        <Skeleton height="100%" radius="var(--radius-l)" />
      </div>
      <div className={styles.meta}>
        <Skeleton width="60%" radius="xs">
          <span>&nbsp;</span>
        </Skeleton>
      </div>
    </div>
  );
}

interface CategoryCardProps {
  view: EmbyView;
  server: EmbyServer;
}

const CategoryCard = memo(function CategoryCard({ view, server }: CategoryCardProps) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);

  const imageUrl = !imgError
    ? getItemImageUrl(server.serverUrl, view, {
        prefer: "primary",
        maxWidth: 500,
        quality: 85,
        accessToken: server.accessToken,
      })
    : undefined;

  const handleClick = () => {
    navigate(`/section/${view.Id}`, { state: { name: view.Name } });
  };

  const renderIcon = () => {
    if (view.CollectionType === "movies") return <IconMovie size={32} opacity={0.6} />;
    if (view.CollectionType === "tvshows") return <IconDeviceTv size={32} opacity={0.6} />;
    return <IconFolder size={32} opacity={0.6} />;
  };

  return (
    <div className={styles.card}>
      <button
        type="button"
        className={styles.cardButton}
        onClick={handleClick}
        aria-label={`View category ${view.Name}`}
      />
      <div className={styles.preview}>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className={styles.image}
            loading="lazy"
            decoding="async"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className={styles.placeholder}>
            {renderIcon()}
            <span className={styles.placeholderTitle}>{view.Name}</span>
          </div>
        )}
      </div>
      <div className={styles.meta}>
        <span className={styles.name} title={view.Name}>
          {view.Name}
        </span>
      </div>
    </div>
  );
});

export interface CategoriesShelfProps {
  server: EmbyServer;
}

export const CategoriesShelf = memo(function CategoriesShelf({ server }: CategoriesShelfProps) {
  const { views, loading } = useUserViews(server);

  if (loading && views.length === 0) {
    return (
      <MediaShelf title="分类" itemWidth={240} gap={16}>
        {[1, 2, 3, 4, 5].map((id) => (
          <CategoryCardSkeleton key={`cat-skel-${id}`} />
        ))}
      </MediaShelf>
    );
  }

  if (views.length === 0) {
    return null;
  }

  return (
    <MediaShelf
      title={<h3 className={shelfClasses.title}>分类</h3>}
      itemWidth={240}
      gap={16}
    >
      {views.map((view) => (
        <CategoryCard key={view.Id} view={view} server={server} />
      ))}
    </MediaShelf>
  );
});
