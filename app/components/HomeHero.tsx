import { type EmbyItemMetadata, type EmbyServer, getItemImageUrl } from "@shared";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useHeroItems } from "../hooks/useHeroItems";
import { useTranslation } from "../lib/i18n";
import styles from "./HomeHero.module.css";

export interface HomeHeroProps {
  server: EmbyServer;
}

export const HomeHero = memo(function HomeHero({ server }: HomeHeroProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { items, loading } = useHeroItems(server, 10);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isHovered, setIsHovered] = useState(false);
  const timerRef = useRef<number | null>(null);

  const count = items.length;

  const goToNext = useCallback(() => {
    setCurrentIndex((prev) => (count > 0 ? (prev + 1) % count : 0));
  }, [count]);

  const goToPrev = useCallback(() => {
    setCurrentIndex((prev) => (count > 0 ? (prev - 1 + count) % count : 0));
  }, [count]);

  // Auto-play timer
  useEffect(() => {
    if (count <= 1 || isHovered) {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    timerRef.current = window.setInterval(() => {
      goToNext();
    }, 6500);

    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [count, isHovered, goToNext]);

  if (loading && count === 0) {
    return <div className={styles.skeleton} />;
  }

  if (count === 0) {
    return null;
  }

  const activeItem = items[currentIndex] || items[0];

  const handleItemClick = (item: EmbyItemMetadata) => {
    navigate(`/item/${item.Id}`, { state: { item } });
  };

  const getBackdropUrl = (item: EmbyItemMetadata) => {
    return (
      getItemImageUrl(server.serverUrl, item, {
        prefer: "backdrop",
        maxWidth: 1920,
        quality: 85,
        accessToken: server.accessToken,
      }) || ""
    );
  };

  const rating =
    typeof activeItem.CommunityRating === "number" && activeItem.CommunityRating > 0
      ? activeItem.CommunityRating.toFixed(1)
      : null;

  const year =
    activeItem.ProductionYear ||
    (activeItem.PremiereDate ? new Date(activeItem.PremiereDate).getFullYear() : null);

  const genre =
    activeItem.Genres?.[0] ||
    (Array.isArray(activeItem.GenreItems) && activeItem.GenreItems[0]?.Name) ||
    (activeItem.Type === "Movie" ? t("movie", "Movie") : activeItem.Type === "Series" ? t("series", "Series") : null);

  return (
    <section
      className={styles.container}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      aria-label="Featured Media"
    >
      {/* Background Slides */}
      {items.map((item, idx) => {
        const isActive = idx === currentIndex;
        return (
          <div
            key={item.Id}
            className={`${styles.slide} ${isActive ? styles.slideActive : ""}`}
            aria-hidden={!isActive}
          >
            <img
              src={getBackdropUrl(item)}
              alt=""
              className={styles.backdropImg}
              loading={idx === 0 ? "eager" : "lazy"}
              decoding="async"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          </div>
        );
      })}

      {/* Atmospheric dark gradient overlays */}
      <div className={styles.overlay} />

      {/* Left / Right Nav Arrows */}
      {count > 1 && (
        <>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navBtnLeft}`}
            onClick={goToPrev}
            aria-label="Previous slide"
          >
            <IconChevronLeft size={22} />
          </button>
          <button
            type="button"
            className={`${styles.navBtn} ${styles.navBtnRight}`}
            onClick={goToNext}
            aria-label="Next slide"
          >
            <IconChevronRight size={22} />
          </button>
        </>
      )}

      {/* Center Details & Pagination */}
      <div className={styles.content}>
        <div
          className={styles.metaWrap}
          onClick={() => handleItemClick(activeItem)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              handleItemClick(activeItem);
            }
          }}
        >
          <h2 className={styles.title}>{activeItem.Name}</h2>

          <div className={styles.metaRow}>
            {rating && (
              <>
                <span className={styles.rating}>★ {rating}</span>
                <span className={styles.metaDot}>·</span>
              </>
            )}
            {year && (
              <>
                <span>{year}</span>
                {genre && <span className={styles.metaDot}>·</span>}
              </>
            )}
            {genre && <span>{genre}</span>}
          </div>

          {activeItem.Overview && (
            <p className={styles.overview}>{activeItem.Overview}</p>
          )}
        </div>

        {/* Carousel Pagination Dots */}
        {count > 1 && (
          <div className={styles.dotsContainer}>
            {items.map((_, dotIdx) => (
              <button
                key={dotIdx}
                type="button"
                className={`${styles.dot} ${dotIdx === currentIndex ? styles.dotActive : ""}`}
                onClick={() => setCurrentIndex(dotIdx)}
                aria-label={`Go to slide ${dotIdx + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
