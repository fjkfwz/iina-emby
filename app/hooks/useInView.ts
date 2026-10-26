import { useCallback, useEffect, useState } from "react";

export interface UseInViewOptions {
  rootMargin?: string;
  triggerOnce?: boolean;
  enabled?: boolean;
  root?: Element | null;
}

/**
 * Hook to detect when an element enters or is near the viewport using IntersectionObserver.
 * Especially useful as a polyfill for lazy-loading images on browsers that do not support
 * native image lazy loading (such as Safari < 15.4 / macOS Catalina).
 *
 * When enabled is false, isInView defaults to true immediately without setting up an observer.
 */
export function useInView<T extends HTMLElement = HTMLElement>(
  options?: UseInViewOptions,
): [(node: T | null) => void, boolean] {
  const rootMargin = options?.rootMargin ?? "300px";
  const triggerOnce = options?.triggerOnce ?? true;
  const enabled = options?.enabled ?? true;
  const root = options?.root ?? null;

  const [node, setNode] = useState<T | null>(null);
  const [isInView, setIsInView] = useState(!enabled);

  const ref = useCallback((element: T | null) => {
    setNode(element);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setIsInView(true);
      return;
    }
    if (!node || (triggerOnce && isInView)) return;

    if (typeof IntersectionObserver === "undefined") {
      setIsInView(true);
      return;
    }

    let observer: IntersectionObserver | null = null;
    try {
      observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setIsInView(true);
              if (triggerOnce && observer) {
                observer.disconnect();
              }
              break;
            } else if (!triggerOnce) {
              setIsInView(false);
            }
          }
        },
        { rootMargin, root },
      );

      observer.observe(node);
    } catch {
      setIsInView(true);
    }

    return () => {
      observer?.disconnect();
    };
  }, [node, rootMargin, triggerOnce, enabled, root, isInView]);

  return [ref, isInView];
}
