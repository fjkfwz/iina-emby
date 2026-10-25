import { useCallback, useState } from "react";

export interface HomeModulesConfig {
  hero: boolean;
  categories: boolean;
  continueWatching: boolean;
  favorites: boolean;
  librarySections: boolean;
}

export const DEFAULT_HOME_MODULES: HomeModulesConfig = {
  hero: true,
  categories: true,
  continueWatching: true,
  favorites: true,
  librarySections: true,
};

const LOCAL_STORAGE_MODULES_KEY = "emby_home_modules";

export function useHomeModulesConfig() {
  const [config, setConfigState] = useState<HomeModulesConfig>(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_MODULES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return { ...DEFAULT_HOME_MODULES, ...parsed };
      }
    } catch {
      // Ignore
    }
    return DEFAULT_HOME_MODULES;
  });

  const setModule = useCallback((key: keyof HomeModulesConfig, enabled: boolean) => {
    setConfigState((prev) => {
      const next = { ...prev, [key]: enabled };
      try {
        localStorage.setItem(LOCAL_STORAGE_MODULES_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const toggleModule = useCallback((key: keyof HomeModulesConfig) => {
    setConfigState((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem(LOCAL_STORAGE_MODULES_KEY, JSON.stringify(next));
      } catch {
        // Ignore
      }
      return next;
    });
  }, []);

  const resetDefaults = useCallback(() => {
    setConfigState(DEFAULT_HOME_MODULES);
    try {
      localStorage.setItem(LOCAL_STORAGE_MODULES_KEY, JSON.stringify(DEFAULT_HOME_MODULES));
    } catch {
      // Ignore
    }
  }, []);

  return {
    config,
    setModule,
    toggleModule,
    resetDefaults,
  };
}
