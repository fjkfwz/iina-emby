import { describe, expect, it } from "vitest";
import { calculatePopoverPosition } from "./usePopoverPosition";

describe("calculatePopoverPosition", () => {
  it("positions popover at bottom-end aligned to trigger right edge", () => {
    const triggerRect = {
      left: 700,
      right: 800,
      top: 50,
      bottom: 80,
      width: 100,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 160,
      top: 0,
      bottom: 200,
      width: 160,
      height: 200,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-end",
      offset: 4,
      windowWidth: 1000,
      windowHeight: 800,
    });

    // Top: trigger.bottom (80) + offset (4) = 84
    expect(result.top).toBe(84);
    // Left: trigger.right (800) - popover.width (160) = 640
    expect(result.left).toBe(640);
    expect(result.side).toBe("bottom");
    expect(result.align).toBe("end");
  });

  it("positions popover at bottom-start aligned to trigger left edge", () => {
    const triggerRect = {
      left: 100,
      right: 200,
      top: 50,
      bottom: 80,
      width: 100,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 160,
      top: 0,
      bottom: 200,
      width: 160,
      height: 200,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-start",
      offset: 4,
      windowWidth: 1000,
      windowHeight: 800,
    });

    expect(result.top).toBe(84);
    expect(result.left).toBe(100);
    expect(result.side).toBe("bottom");
    expect(result.align).toBe("start");
  });

  it("flips to top when there is not enough vertical room below", () => {
    const triggerRect = {
      left: 100,
      right: 200,
      top: 600,
      bottom: 630,
      width: 100,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 160,
      top: 0,
      bottom: 200,
      width: 160,
      height: 200,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-end",
      offset: 4,
      windowWidth: 1000,
      windowHeight: 700, // 630 + 4 + 200 = 834 > 700
    });

    // Flips to top: trigger.top (600) - offset (4) - popover.height (200) = 396
    expect(result.top).toBe(396);
    expect(result.side).toBe("top");
    expect(result.align).toBe("end");
  });

  it("does not clamp top to viewport when clampVertical is false", () => {
    const triggerRect = {
      left: 100,
      right: 200,
      top: 100,
      bottom: 130,
      width: 100,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 160,
      top: 0,
      bottom: 400,
      width: 160,
      height: 400,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-end",
      offset: 4,
      windowWidth: 1000,
      windowHeight: 400,
      clampVertical: false,
    });

    // Directly follows trigger bottom: 130 + 4 = 134 (unclamped by viewport height limit)
    expect(result.top).toBe(134);
  });

  it("safely clamps within viewport padding and respects topSafeArea to avoid overlapping window controls", () => {
    const triggerRect = {
      left: 5,
      right: 105,
      top: 5,
      bottom: 35,
      width: 100,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 360,
      top: 0,
      bottom: 500,
      width: 360,
      height: 500,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-start",
      offset: 4,
      windowWidth: 800,
      windowHeight: 600,
    });

    // Left is clamped to at least 16px safe margin
    expect(result.left).toBe(16);
    // Top is placed at trigger bottom + offset = 39, and clamped to at least topSafeArea (44)
    expect(result.top).toBe(44);
  });

  it("dynamically sets maxHeight when space below is constrained", () => {
    const triggerRect = {
      left: 200,
      right: 400,
      top: 200,
      bottom: 230,
      width: 200,
      height: 30,
    };

    const popoverRect = {
      left: 0,
      right: 360,
      top: 0,
      bottom: 500,
      width: 360,
      height: 500,
    };

    const result = calculatePopoverPosition({
      triggerRect,
      popoverRect,
      placement: "bottom-end",
      offset: 4,
      windowWidth: 800,
      windowHeight: 600,
    });

    // Top: 230 + 4 = 234
    // Space below: 600 - 16 - 234 = 350px
    // Since 500 doesn't fit, maxHeight is capped at 350px
    expect(result.top).toBe(234);
    expect(result.maxHeight).toBe(350);
  });
});
