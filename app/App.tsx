import { QueryClientProvider } from "@tanstack/react-query";
import { HashRouter, Navigate, Route, Routes } from "react-router";
import { ScrollProgress } from "./components/ui";
import { IINABridgeProvider } from "./hooks/useIINABridge";
import { queryClient } from "./lib/query-client";
import ContinueWatchingRoute from "./routes/continue-watching";
import HomeRoute from "./routes/home";
import ItemDetailRoute from "./routes/item";
import SearchRoute from "./routes/search";
import SectionRoute from "./routes/section";
import ServersRoute from "./routes/servers";
import SettingsRoute from "./routes/settings";
import SystemInfoRoute from "./routes/system-info";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <IINABridgeProvider>
        <HashRouter>
          <Routes>
            <Route path="/" element={<HomeRoute />} />
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
        </HashRouter>
      </IINABridgeProvider>
    </QueryClientProvider>
  );
}
