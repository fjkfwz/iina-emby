import { useCallback, useEffect, useRef, useState } from "react";

export interface UseInViewOptions {
  rootMargin?: string;
  triggerOnce?: boolean;
  enabled?: boolean;
  root?: Element | null;
}

type ObserverCallback = (isIntersecting: boolean) => void;

interface SharedObserverInstance {
  observer: IntersectionObserver;
  elements: Map<Element, ObserverCallback>;
}

const observerRegistry = new Map<string, SharedObserverInstance>();

function getSharedObserver(rootMargin: string, root: Element | null): SharedObserverInstance | null {
  if (typeof IntersectionObserver === "undefined") return null;
  const key = `${rootMargin}|${root ? "custom" : "window"}`;
  let instance = observerRegistry.get(key);
  if (!instance) {
    const elements = new Map<Element, ObserverCallback>();
    try {
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const cb = elements.get(entry.target);
            if (cb) {
              cb(entry.isIntersecting);
            }
          }
        },
        { rootMargin, root },
      );
      instance = { observer, elements };
      observerRegistry.set(key, instance);
    } catch {
      return null;
    }
  }
  return instance;
}

/**
 * High-performance hook to detect when an element enters or is near the viewport
 * using a single shared IntersectionObserver instance per rootMargin configuration.
 *
 * Designed to prevent CPU/memory spikes on older WebKit environments (such as Safari < 15.4 / macOS Catalina).
 */
export function useInView<T extends HTMLElement = HTMLElement>(
  options?: UseInViewOptions,
): [(node: T | null) => void, boolean] {
  const rootMargin = options?.rootMargin ?? "300px";
  const triggerOnce = options?.triggerOnce ?? true;
  const enabled = options?.enabled ?? true;
  const root = options?.root ?? null;

  const [isInView, setIsInView] = useState(!enabled);
  const elementRef = useRef<T | null>(null);
  const observerInstanceRef = useRef<SharedObserverInstance | null>(null);
  const fallbackTimerRef = useRef<NodeJS.Timeout | null>(null);

  const ref = useCallback(
    (element: T | null) => {
      if (!enabled) {
        setIsInView(true);
        return;
      }
      if (elementRef.current === element) return;

      // Clean up previous observation if element changed
      if (elementRef.current && observerInstanceRef.current) {
        observerInstanceRef.current.elements.delete(elementRef.current);
        observerInstanceRef.current.observer.unobserve(elementRef.current);
      }
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }

      elementRef.current = element;

      if (!element) return;

      // Fast-path: immediately detect if element is already within (or near) the viewport.
      // Solves WebKit/Safari 13 bug where IntersectionObserver in horizontal/vertical overflow containers fails to dispatch.
      if (typeof window !== "undefined") {
        try {
          const rect = element.getBoundingClientRect();
          const winHeight = window.innerHeight || 800;
          const winWidth = window.innerWidth || 1200;
          if (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > -300 &&
            rect.top < winHeight + 300 &&
            rect.right > -300 &&
            rect.left < winWidth + 300
          ) {
            setIsInView(true);
            if (triggerOnce) return;
          }
        } catch {
          // ignore measurement errors
        }
      }

      const instance = getSharedObserver(rootMargin, root);
      if (!instance) {
        setIsInView(true);
        return;
      }

      observerInstanceRef.current = instance;

      instance.elements.set(element, (isIntersecting) => {
        if (isIntersecting) {
          setIsInView(true);
          if (fallbackTimerRef.current) {
            clearTimeout(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
          }
          if (triggerOnce) {
            instance.elements.delete(element);
            instance.observer.unobserve(element);
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      });

      instance.observer.observe(element);

      // Safe fallback timer for legacy Safari 13 WebKit where IntersectionObserver in nested scroll containers may stall
      fallbackTimerRef.current = setTimeout(() => {
        setIsInView(true);
      }, 1200);
    },
    [enabled, triggerOnce, rootMargin, root],
  );

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      if (elementRef.current && observerInstanceRef.current) {
        observerInstanceRef.current.elements.delete(elementRef.current);
        observerInstanceRef.current.observer.unobserve(elementRef.current);
      }
    };
  }, []);

  return [ref, enabled ? isInView : true];
}
