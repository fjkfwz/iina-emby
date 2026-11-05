import { flushSync } from "react-dom";

/**
 * Attribute set on <html> while a transition started by `startViewTransitionSafe` is running.
 * Components opt into transitions via CSS, e.g.
 * `:global(html[data-view-transition]) .card { view-transition-name: match-element; }`,
 * so elements are only captured during our own transitions (not permanently, and not
 * during unrelated transitions such as router navigations).
 */
export const VIEW_TRANSITION_ATTR = "data-view-transition";

let activeTransitions = 0;

function canAnimate(): boolean {
  return (
    typeof document !== "undefined" &&
    "startViewTransition" in document &&
    !document.documentElement.hasAttribute("data-performance-mode") &&
    // `match-element` is required: Safari 18.4+ / Chrome 137+. Without it no element
    // would be named and the transition would only add a pointless async frame.
    typeof CSS !== "undefined" &&
    CSS.supports("view-transition-name", "match-element") &&
    !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  );
}

/**
 * Safely executes a DOM state update within a native View Transition if supported.
 * Falls back to direct synchronous execution if not supported or if user prefers reduced motion.
 */
export function startViewTransitionSafe(updateFn: () => void): void {
  if (!canAnimate()) {
    updateFn();
    return;
  }

  const root = document.documentElement;
  // Ref-count: a new transition skips the previous one, whose `finished` settles
  // asynchronously and must not remove the attribute from under the new transition.
  activeTransitions++;
  root.setAttribute(VIEW_TRANSITION_ATTR, "");

  const transition = document.startViewTransition(() => {
    flushSync(updateFn);
  });

  transition.finished.finally(() => {
    activeTransitions--;
    if (activeTransitions === 0) {
      root.removeAttribute(VIEW_TRANSITION_ATTR);
    }
  });
}
