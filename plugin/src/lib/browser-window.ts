import { WINDOW_DIMENSIONS, WINDOW_PREF_KEYS } from "@shared";
import type { DebugLogger } from "./debug-log";
import type { WebviewBridgeDeps } from "./webview-bridge";
import { registerBridgeHandlers } from "./webview-bridge";

export interface BrowserWindowDeps {
  core?: typeof iina.core;
  sidebar?: typeof iina.sidebar;
  standaloneWindow: typeof iina.standaloneWindow;
  preferences: typeof iina.preferences;
  bridgeDeps: WebviewBridgeDeps;
  log: DebugLogger;
}

export function createBrowserWindowManager({ core, sidebar, standaloneWindow, preferences, bridgeDeps, log }: BrowserWindowDeps) {
  let standaloneInitialized = false;

  function openEmbyStandaloneWindow(): void {
    try {
      log("Opening standalone Emby browser window");

      if (!standaloneInitialized) {
        standaloneInitialized = true;

        // Load the React SPA HTML in standalone window
        standaloneWindow.loadFile("dist/client/index.html");

        let windowX = (preferences.get("window_x") as number | undefined) ?? 120;
        let windowY = (preferences.get("window_y") as number | undefined) ?? 145;

        // Restore previously saved window dimensions or use default dimensions
        const savedWidth = preferences.get(WINDOW_PREF_KEYS.WIDTH) as number | undefined;
        const savedHeight = preferences.get(WINDOW_PREF_KEYS.HEIGHT) as number | undefined;
        const width =
          typeof savedWidth === "number" && savedWidth >= WINDOW_DIMENSIONS.MIN_WIDTH ? savedWidth : WINDOW_DIMENSIONS.DEFAULT_WIDTH;
        const height =
          typeof savedHeight === "number" && savedHeight >= WINDOW_DIMENSIONS.MIN_HEIGHT ? savedHeight : WINDOW_DIMENSIONS.DEFAULT_HEIGHT;

        // Position window at saved location
        standaloneWindow.setFrame(width, height, Math.round(windowX), Math.round(windowY));

        const saWithProps = standaloneWindow as unknown as {
          setProperty?: (props: Record<string, unknown>) => void;
        };
        if (typeof saWithProps.setProperty === "function") {
          saWithProps.setProperty({
            title: "Emby Browser",
            resizable: true,
            hideTitleBar: true,
            fullSizeContentView: true,
            enableWebInspector: true,
          });
        }

        // Listen for window drag/move messages from the webview
        standaloneWindow.onMessage("move-window", (data?: { dx?: number; dy?: number; x?: number; y?: number }) => {
          if (typeof data?.dx === "number" && typeof data?.dy === "number") {
            windowX += data.dx;
            // dy > 0 means mouse moved down on screen; Cocoa Y origin is bottom of screen, so subtract dy
            windowY -= data.dy;
            standaloneWindow.setFrame(null, null, Math.round(windowX), Math.round(windowY));
            preferences.set("window_x", Math.round(windowX));
            preferences.set("window_y", Math.round(windowY));
          } else if (typeof data?.x === "number" && typeof data?.y === "number") {
            windowX = data.x;
            windowY = data.y;
            standaloneWindow.setFrame(null, null, Math.round(windowX), Math.round(windowY));
            preferences.set("window_x", Math.round(windowX));
            preferences.set("window_y", Math.round(windowY));
          }
        });

        // Listen for window resize events from the webview to persist size
        standaloneWindow.onMessage("save-window-size", (data?: { width?: number; height?: number }) => {
          if (data?.width && data?.height && data.width >= WINDOW_DIMENSIONS.MIN_WIDTH && data.height >= WINDOW_DIMENSIONS.MIN_HEIGHT) {
            const w = Math.round(data.width);
            const h = Math.round(data.height);
            preferences.set(WINDOW_PREF_KEYS.WIDTH, w);
            preferences.set(WINDOW_PREF_KEYS.HEIGHT, h);
            preferences.sync();
            log(`Saved standalone window size: ${w}x${h}`);
          }
        });

        // Register bridge handlers (keep standalone window open on media play)
        registerBridgeHandlers(standaloneWindow, bridgeDeps, { closeOnPlay: false, isStandalone: true });
      }

      // Open the window
      standaloneWindow.open();
      standaloneWindow.postMessage("window-context", { isStandalone: true });
      standaloneWindow.postMessage("window-reopened", { timestamp: Date.now() });

      log("Standalone Emby browser window opened successfully");
      const sessionData = bridgeDeps.getStoredEmbySession();
      if (core) {
        if (sessionData) {
          core.osd(`Emby Browser opened in standalone window\nServer: ${sessionData.serverUrl.replace(/^https?:\/\//, "")}`);
        } else {
          core.osd("Emby Browser opened in standalone window\nPlease login to access your media");
        }
      }
    } catch (error: unknown) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      log.error(`Failed to create standalone window: ${errorMsg}`);
    }
  }

  function showEmbyBrowser(): void {
    log("Attempting to show Emby browser");

    // The sidebar lives inside the player window, so it is only useful while that
    // window is on screen. sidebar.show() cannot be used to detect that: it only
    // throws while the window has never been loaded, and IINA keeps window.loaded
    // true after the window is closed. Showing it then succeeds silently on an
    // invisible window and the browser appears to do nothing until IINA restarts.
    let windowAvailable = false;
    if (core) {
      try {
        windowAvailable = Boolean(core.window?.loaded && core.window.visible);
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Could not read window state: ${errorMsg}`);
      }
    }

    if (windowAvailable && sidebar && typeof sidebar.show === "function") {
      try {
        initSidebar();
        sidebar.show();
        sidebar.postMessage("window-reopened", { timestamp: Date.now() });
        log("Sidebar shown successfully");
        return;
      } catch (error: unknown) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        log(`Direct sidebar.show() failed: ${errorMsg}`);
      }
    } else {
      log(`No visible player window (windowAvailable=${windowAvailable}), using standalone`);
    }

    openEmbyStandaloneWindow();
  }

  let sidebarInitialized = false;

  function initSidebar(): void {
    if (!sidebar || sidebarInitialized) return;
    sidebarInitialized = true;
    sidebar.loadFile("dist/client/index.html");
    registerBridgeHandlers(sidebar, bridgeDeps, { closeOnPlay: false, isStandalone: false });
    sidebar.postMessage("window-context", { isStandalone: false });
  }

  return {
    openEmbyStandaloneWindow,
    showEmbyBrowser,
    initSidebar,
  };
}
