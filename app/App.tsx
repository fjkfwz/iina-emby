import { QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { HashRouter, Navigate, Route, Routes, useLocation } from "react-router";
import { ScrollProgress } from "./components/ui";
import { IINABridgeProvider } from "./hooks/useIINABridge";
import { LanguageProvider } from "./lib/i18n";
import { queryClient } from "./lib/query-client";
import ContinueWatchingRoute from "./routes/continue-watching";
import HomeRoute from "./routes/home";
import ItemDetailRoute from "./routes/item";
import SearchRoute from "./routes/search";
import SectionRoute from "./routes/section";
import ServersRoute from "./routes/servers";
import SettingsRoute from "./routes/settings";
import SystemInfoRoute from "./routes/system-info";

function AppContent() {
  const location = useLocation();
  const isHome = location.pathname === "/";
  const homeScrollTopRef = useRef<number>(0);

  // Continuously track Home scroll position in real time
  useEffect(() => {
    if (!isHome) return;
    const rootEl = document.getElementById("root");
    if (!rootEl) return;

    const onScroll = () => {
      homeScrollTopRef.current = rootEl.scrollTop;
    };
    rootEl.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      rootEl.removeEventListener("scroll", onScroll);
    };
  }, [isHome]);

  // Restore Home scroll position instantly upon returning
  useLayoutEffect(() => {
    if (!isHome) return;
    const rootEl = document.getElementById("root");
    if (!rootEl) return;

    const savedTop = homeScrollTopRef.current;
    rootEl.scrollTop = savedTop;
    requestAnimationFrame(() => {
      if (rootEl.scrollTop !== savedTop) {
        rootEl.scrollTop = savedTop;
      }
    });
  }, [isHome]);

  // Reset scroll to top when navigating to non-home routes or between items/sections
  useLayoutEffect(() => {
    if (isHome) return;
    const rootEl = document.getElementById("root");
    if (rootEl) {
      rootEl.scrollTop = 0;
    }
    window.scrollTo(0, 0);
    requestAnimationFrame(() => {
      if (rootEl && rootEl.scrollTop !== 0) {
        rootEl.scrollTop = 0;
      }
    });
  }, [location.pathname, isHome]);

  // Only re-create the persistent home element when visibility changes, so unrelated
  // navigations (e.g. the `?q=` updates fired while typing in search) don't re-render
  // the whole home tree behind the scenes.
  const persistentHome = useMemo(() => <HomeRoute isVisible={isHome} />, [isHome]);

  return (
    <>
      {/* Persistent Home View: Keeps heavy media DOM, image decodes, and state alive to ensure 0ms instant back navigation */}
      <div
        id="home-persistent-view"
        style={{
          display: isHome ? "block" : "none",
        }}
        aria-hidden={!isHome}
      >
        {persistentHome}
      </div>

      <Routes>
        <Route path="/" element={null} />
        <Route path="/search" element={<SearchRoute />} />
        <Route path="/continue-watching" element={<ContinueWatchingRoute />} />
        <Route path="/section/:id" element={<SectionRoute />} />
        <Route path="/item/:id" element={<ItemDetailRoute />} />
        <Route path="/servers" element={<ServersRoute />} />
        <Route path="/settings" element={<SettingsRoute />} />
        <Route path="/system-info" element={<SystemInfoRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <ScrollProgress />
    </>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <LanguageProvider>
        <IINABridgeProvider>
          <HashRouter>
            <AppContent />
          </HashRouter>
        </IINABridgeProvider>
      </LanguageProvider>
    </QueryClientProvider>
  );
}
