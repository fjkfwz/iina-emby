import type { EmbyServer, EmbyView } from "@shared";
import { decodeWebpToPng, getCachedDecodedWebp, getItemImageUrl, isWebpSupported } from "@shared";
import { IconDeviceTv, IconFolder, IconMovie } from "@tabler/icons-react";
import { memo, useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { useUserViews } from "../hooks/useUserViews";
import { useTranslation } from "../lib/i18n";
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
  const [isLoaded, setIsLoaded] = useState(false);

  const rawImageUrl = getItemImageUrl(server.serverUrl, view, {
    prefer: "primary",
    maxWidth: 500,
    quality: 85,
    accessToken: server.accessToken,
  });

  const [decodedSrc, setDecodedSrc] = useState<string | null>(() => (rawImageUrl ? getCachedDecodedWebp(rawImageUrl) || null : null));

  // If WebP is not natively supported by the browser (such as Safari < 14 on macOS Catalina),
  // decode the category WebP image to PNG via libwebp polyfill.
  useEffect(() => {
    if (!isWebpSupported() && rawImageUrl && !decodedSrc && !imgError) {
      let cancelled = false;
      decodeWebpToPng(rawImageUrl)
        .then((png) => {
          if (!cancelled) {
            setDecodedSrc(png);
            setIsLoaded(true);
          }
        })
        .catch((err) => {
          if (!cancelled) {
            console.warn("Failed to polyfill category WebP image:", err);
            setImgError(true);
          }
        });
      return () => {
        cancelled = true;
      };
    }
  }, [rawImageUrl, decodedSrc, imgError]);

  const activeSrc = decodedSrc || (!imgError ? rawImageUrl : undefined);

  const handleClick = () => {
    navigate(`/section/${view.Id}`, { state: { name: view.Name } });
  };

  const handleImgError = () => {
    if (!isWebpSupported() && rawImageUrl && !decodedSrc) {
      decodeWebpToPng(rawImageUrl)
        .then((png) => {
          setDecodedSrc(png);
          setIsLoaded(true);
        })
        .catch(() => {
          setImgError(true);
        });
    } else {
      setImgError(true);
    }
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
        {activeSrc && !imgError ? (
          <img
            src={activeSrc}
            alt=""
            className={styles.image}
            loading="eager"
            decoding="async"
            style={{ opacity: isLoaded ? 1 : 0, transition: "opacity 0.2s ease" }}
            onLoad={() => setIsLoaded(true)}
            onError={handleImgError}
            ref={(el) => {
              if (el && el.complete && el.naturalWidth > 0) {
                setIsLoaded(true);
              }
            }}
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
  const { t } = useTranslation();
  const { views, loading } = useUserViews(server);
  const titleText = t("categoriesNav", "Categories");

  if (loading && views.length === 0) {
    return (
      <MediaShelf title={titleText} itemWidth={240} gap={16}>
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
      title={<h3 className={shelfClasses.title}>{titleText}</h3>}
      itemWidth={240}
      gap={16}
    >
      {views.map((view) => (
        <CategoryCard key={view.Id} view={view} server={server} />
      ))}
    </MediaShelf>
  );
});
