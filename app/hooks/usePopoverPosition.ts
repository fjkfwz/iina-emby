import { useCallback } from "react";

export type PopoverPlacement = "bottom-start" | "bottom-end" | "top-start" | "top-end";

export const DEFAULT_POPOVER_PLACEMENT: PopoverPlacement = "bottom-end";
export const DEFAULT_POPOVER_OFFSET = 6;
export const DEFAULT_POPOVER_VIEWPORT_PADDING = 16;

export interface CalculatePopoverPositionOptions {
  triggerRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  popoverRect: { top: number; bottom: number; left: number; right: number; width: number; height: number };
  placement?: PopoverPlacement;
  offset?: number;
  viewportPadding?: number;
  windowWidth: number;
  windowHeight: number;
  clampVertical?: boolean;
}

export interface CalculatedPopoverPosition {
  top: number;
  left: number;
  side: "bottom" | "top";
  align: "start" | "end";
}

/**
 * Pure calculation function for popover position.
 */
export function calculatePopoverPosition({
  triggerRect,
  popoverRect,
  placement = DEFAULT_POPOVER_PLACEMENT,
  offset = DEFAULT_POPOVER_OFFSET,
  viewportPadding = DEFAULT_POPOVER_VIEWPORT_PADDING,
  windowWidth,
  windowHeight,
  clampVertical = true,
}: CalculatePopoverPositionOptions): CalculatedPopoverPosition {
  let [side, align] = placement.split("-") as ["bottom" | "top", "start" | "end"];

  const fitsBottom = triggerRect.bottom + offset + popoverRect.height <= windowHeight - viewportPadding;
  const fitsTop = triggerRect.top - offset - popoverRect.height >= viewportPadding;

  // Flip vertically if there's not enough room below but enough room above, or vice versa
  if (side === "bottom" && !fitsBottom && fitsTop) {
    side = "top";
  } else if (side === "top" && !fitsTop && fitsBottom) {
    side = "bottom";
  } else if (!fitsBottom && !fitsTop) {
    // If it fits neither side fully, place on the side with more available space
    const spaceBelow = windowHeight - viewportPadding - (triggerRect.bottom + offset);
    const spaceAbove = triggerRect.top - offset - viewportPadding;
    side = spaceBelow >= spaceAbove ? "bottom" : "top";
  }

  let top = side === "bottom" ? triggerRect.bottom + offset : triggerRect.top - offset - popoverRect.height;
  let left = align === "start" ? triggerRect.left : triggerRect.right - popoverRect.width;

  const maxLeft = Math.max(viewportPadding, windowWidth - popoverRect.width - viewportPadding);
  left = Math.min(Math.max(left, viewportPadding), maxLeft);

  if (clampVertical) {
    const maxTop = Math.max(viewportPadding, windowHeight - popoverRect.height - viewportPadding);
    top = Math.min(Math.max(top, viewportPadding), maxTop);
  }

  return { top, left, side, align };
}

export interface UsePopoverPositionOptions {
  triggerRef: React.RefObject<HTMLElement | null>;
  popoverRef: React.RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  /** Gap between trigger and popover in px. Defaults to 6. */
  offset?: number;
  /** Minimum padding to viewport edges in px. Defaults to 8. */
  viewportPadding?: number;
  /** Whether to clamp the vertical coordinate within the viewport (defaults to true). Set false for scrollable popovers that follow trigger motion. */
  clampVertical?: boolean;
}

export function usePopoverPosition({
  triggerRef,
  popoverRef,
  placement = DEFAULT_POPOVER_PLACEMENT,
  offset = DEFAULT_POPOVER_OFFSET,
  viewportPadding = DEFAULT_POPOVER_VIEWPORT_PADDING,
  clampVertical = true,
}: UsePopoverPositionOptions) {
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    const popover = popoverRef.current;
    if (!trigger || !popover) return;

    const tr = trigger.getBoundingClientRect();
    const mr = popover.getBoundingClientRect();

    // Use unscaled layout dimensions (offsetWidth/offsetHeight) because
    // getBoundingClientRect() is affected by CSS transform: scale(...) during transitions!
    const popoverWidth = popover.offsetWidth || mr.width;
    const popoverHeight = popover.offsetHeight || mr.height;

    const { top, left, side, align } = calculatePopoverPosition({
      triggerRect: tr,
      popoverRect: {
        top: mr.top,
        bottom: mr.bottom,
        left: mr.left,
        right: mr.right,
        width: popoverWidth,
        height: popoverHeight,
      },
      placement,
      offset,
      viewportPadding,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      clampVertical,
    });

    popover.style.top = `${Math.round(top)}px`;
    popover.style.left = `${Math.round(left)}px`;
    popover.dataset.side = side;
    popover.dataset.align = align;
  }, [triggerRef, popoverRef, placement, offset, viewportPadding, clampVertical]);

  return { updatePosition };
}
