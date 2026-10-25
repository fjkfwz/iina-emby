import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import React, { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import classes from "./MediaShelf.module.css";

export interface MediaShelfProps {
  /** Optional header title (string or custom React node) */
  title?: ReactNode;
  /** Optional right actions next to the title (e.g. reload button, view all) */
  rightSection?: ReactNode;
  /** Child elements to be rendered horizontally (e.g. MediaThumb cards) */
  children: ReactNode;
  /** Width of each item in pixels or CSS string, default 260 */
  itemWidth?: number | string;
  /** Gap between items in pixels, default 16 */
  gap?: number;
  /** Custom container class */
  className?: string;
  /** Optional message when children are empty */
  emptyText?: string;
}

export function MediaShelf({ title, rightSection, children, itemWidth = 260, gap = 16, className, emptyText }: MediaShelfProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const el = scrollRef.current;
      if (!el) return;
      const { scrollLeft, scrollWidth, clientWidth } = el;
      const nextLeft = scrollLeft > 5;
      const nextRight = scrollLeft + clientWidth < scrollWidth - 5;
      setCanScrollLeft((prev) => (prev !== nextLeft ? nextLeft : prev));
      setCanScrollRight((prev) => (prev !== nextRight ? nextRight : prev));
    });
  }, []);

  const validChildren = React.Children.toArray(children).filter(Boolean);
  const childCount = validChildren.length;

  useEffect(() => {
    if (childCount > 0) {
      checkScroll();
    }
    const el = scrollRef.current;
    if (!el) return;

    const ro = new ResizeObserver(() => {
      checkScroll();
    });
    ro.observe(el);

    window.addEventListener("resize", checkScroll, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", checkScroll);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, [checkScroll, childCount]);

  const handleScroll = (direction: "left" | "right") => {
    const el = scrollRef.current;
    if (!el) return;
    const numericItemWidth = typeof itemWidth === "number" ? itemWidth : Number.parseInt(String(itemWidth), 10) || 260;
    const itemStep = numericItemWidth + gap;
    const visibleItems = Math.max(1, Math.floor(el.clientWidth / itemStep));
    const scrollAmount = visibleItems * itemStep;
    const delta = direction === "left" ? -scrollAmount : scrollAmount;
    const prevLeft = el.scrollLeft;

    try {
      el.scrollBy({
        left: delta,
        behavior: "smooth",
      });
    } catch {
      el.scrollLeft += delta;
    }

    // Older WebKit (Safari 13) silently ignores { left, behavior } dictionary without throwing
    if (el.scrollLeft === prevLeft) {
      if (typeof (el as unknown as { scrollBy?: (x: number, y: number) => void }).scrollBy === "function") {
        try {
          (el as unknown as { scrollBy: (x: number, y: number) => void }).scrollBy(delta, 0);
        } catch {
          el.scrollLeft += delta;
        }
      } else {
        el.scrollLeft += delta;
      }
    }
  };

  const showNavArrows = canScrollLeft || canScrollRight;

  return (
    <section className={`${classes.container} ${className || ""}`}>
      {(title || rightSection || showNavArrows) && (
        <div className={classes.header}>
          <div>{typeof title === "string" ? <h3 className={classes.title}>{title}</h3> : title}</div>

          <div className={classes.navGroup}>
            {rightSection}
            {showNavArrows && (
              <>
                <button
                  type="button"
                  className={classes.arrowBtn}
                  disabled={!canScrollLeft}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleScroll("left")}
                  aria-label="Scroll left"
                >
                  <IconChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  className={classes.arrowBtn}
                  disabled={!canScrollRight}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleScroll("right")}
                  aria-label="Scroll right"
                >
                  <IconChevronRight size={18} />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {childCount > 0 ? (
        <div ref={scrollRef} className={classes.scroller} onScroll={checkScroll}>
          {validChildren.map((child, index) => (
            <div
              key={index}
              className={classes.itemWrapper}
              style={{
                width: itemWidth,
                marginRight: index < childCount - 1 ? gap : 0,
              }}
            >
              {child}
            </div>
          ))}
        </div>
      ) : emptyText ? (
        <div className={classes.emptyText}>{emptyText}</div>
      ) : null}
    </section>
  );
}

// Convenient alias
export const MediaRow = MediaShelf;
