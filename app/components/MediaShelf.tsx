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
  const lastScrollTimeRef = useRef(0);
  const scrollVelocityRef = useRef(1);

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

    const now = Date.now();
    const timeSinceLast = now - lastScrollTimeRef.current;
    lastScrollTimeRef.current = now;

    if (timeSinceLast < 450) {
      scrollVelocityRef.current = Math.min(scrollVelocityRef.current + 0.8, 3.0);
    } else {
      scrollVelocityRef.current = 1;
    }

    const numericItemWidth = typeof itemWidth === "number" ? itemWidth : Number.parseInt(String(itemWidth), 10) || 260;
    const itemStep = numericItemWidth + gap;
    const visibleItems = Math.max(1, Math.floor(el.clientWidth / itemStep));
    const baseScrollAmount = visibleItems * itemStep;
    const scrollAmount = Math.round(baseScrollAmount * scrollVelocityRef.current);
    const delta = direction === "left" ? -scrollAmount : scrollAmount;

    try {
      el.scrollBy({
        left: delta,
        behavior: scrollVelocityRef.current > 1.6 ? "auto" : "smooth",
      });
    } catch {
      el.scrollLeft += delta;
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
        <div
          ref={scrollRef}
          className={classes.scroller}
          style={{ "--shelf-gap": `${gap}px` } as React.CSSProperties}
          onScroll={checkScroll}
        >
          {validChildren.map((child, index) => (
            <div
              key={index}
              className={classes.itemWrapper}
              style={{
                width: itemWidth,
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
