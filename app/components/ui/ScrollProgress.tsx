import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import classes from "./ScrollProgress.module.css";

export function ScrollProgress() {
  const trackRef = useRef<HTMLDivElement>(null);
  const [isScrollable, setIsScrollable] = useState(false);
  const [thumbTop, setThumbTop] = useState(0);
  const [thumbHeight, setThumbHeight] = useState(40);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartYRef = useRef(0);
  const dragStartScrollTopRef = useRef(0);
  const fadeTimeoutRef = useRef<number | null>(null);
  const rafIdRef = useRef<number | null>(null);

  const updateProgress = useCallback(() => {
    const root = document.getElementById("root");
    if (!root) return;

    const { scrollTop, scrollHeight, clientHeight } = root;
    const maxScroll = scrollHeight - clientHeight;

    if (maxScroll <= 15) {
      setIsScrollable(false);
      return;
    }

    setIsScrollable(true);
    const trackHeight = trackRef.current ? trackRef.current.clientHeight : Math.max(100, clientHeight - 90);
    // Thumb height proportional to viewport ratio (min 36px, max 70% of track)
    const calculatedHeight = Math.min(
      trackHeight * 0.7,
      Math.max(36, (clientHeight / scrollHeight) * trackHeight)
    );
    setThumbHeight(calculatedHeight);

    const availableTravel = trackHeight - calculatedHeight;
    const progress = Math.min(1, Math.max(0, scrollTop / maxScroll));
    setThumbTop(progress * availableTravel);
  }, []);

  const handleScroll = useCallback(() => {
    if (rafIdRef.current !== null) return;
    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      updateProgress();
      setIsScrolling(true);

      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      fadeTimeoutRef.current = window.setTimeout(() => {
        setIsScrolling(false);
      }, 1500);
    });
  }, [updateProgress]);

  // Track resize & mutations in root element
  useEffect(() => {
    const root = document.getElementById("root");
    if (!root) return;

    updateProgress();
    root.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", updateProgress, { passive: true });

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        updateProgress();
      });
      ro.observe(root);
    }

    return () => {
      root.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", updateProgress);
      ro?.disconnect();
      if (fadeTimeoutRef.current !== null) {
        window.clearTimeout(fadeTimeoutRef.current);
      }
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [handleScroll, updateProgress]);

  // Handle Dragging
  const handleThumbMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging(true);
    dragStartYRef.current = e.clientY;
    const root = document.getElementById("root");
    dragStartScrollTopRef.current = root ? root.scrollTop : 0;
  };

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const root = document.getElementById("root");
      const track = trackRef.current;
      if (!root || !track) return;

      const trackHeight = track.clientHeight;
      const availableTravel = trackHeight - thumbHeight;
      if (availableTravel <= 0) return;

      const maxScroll = root.scrollHeight - root.clientHeight;
      const deltaY = e.clientY - dragStartYRef.current;
      const scrollRatio = maxScroll / availableTravel;

      root.scrollTop = Math.min(maxScroll, Math.max(0, dragStartScrollTopRef.current + deltaY * scrollRatio));
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, thumbHeight]);

  // Handle clicking track to jump
  const handleTrackClick = (e: React.MouseEvent) => {
    const track = trackRef.current;
    const root = document.getElementById("root");
    if (!track || !root) return;

    const rect = track.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const trackHeight = track.clientHeight;
    const availableTravel = trackHeight - thumbHeight;
    if (availableTravel <= 0) return;

    const targetThumbTop = Math.min(availableTravel, Math.max(0, clickY - thumbHeight / 2));
    const progress = targetThumbTop / availableTravel;
    const maxScroll = root.scrollHeight - root.clientHeight;

    root.scrollTo({
      top: progress * maxScroll,
      behavior: "smooth",
    });
  };

  const isActive = isScrolling || isHovered || isDragging;

  if (typeof document === "undefined" || !document.body) {
    return null;
  }

  return createPortal(
    <div
      ref={trackRef}
      className={`${classes.track} ${isActive ? classes.active : ""} ${!isScrollable ? classes.hidden : ""}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={handleTrackClick}
      title="Page scroll progress"
      aria-label="Page scroll progress"
    >
      {/* Subtle progress fill from top */}
      <div
        className={classes.progressFill}
        style={{ height: `${thumbTop + thumbHeight / 2}px` }}
      />
      {/* Thumb / Pill */}
      <div
        className={`${classes.thumb} ${isDragging ? classes.dragging : ""}`}
        style={{
          top: `${thumbTop}px`,
          height: `${thumbHeight}px`,
        }}
        onMouseDown={handleThumbMouseDown}
        onClick={(e) => e.stopPropagation()}
      />
    </div>,
    document.body
  );
}
