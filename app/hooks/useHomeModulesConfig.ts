import { useCallback, useEffect, useState } from "react";

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

let currentConfig: HomeModulesConfig = (() => {
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
})();

const listeners = new Set<(cfg: HomeModulesConfig) => void>();

function updateGlobalConfig(next: HomeModulesConfig) {
  currentConfig = next;
  try {
    localStorage.setItem(LOCAL_STORAGE_MODULES_KEY, JSON.stringify(next));
  } catch {
    // Ignore
  }
  for (const listener of listeners) {
    listener(next);
  }
}

export function useHomeModulesConfig() {
  const [config, setConfigState] = useState<HomeModulesConfig>(currentConfig);

  useEffect(() => {
    listeners.add(setConfigState);
    return () => {
      listeners.delete(setConfigState);
    };
  }, []);

  const setModule = useCallback((key: keyof HomeModulesConfig, enabled: boolean) => {
    const next = { ...currentConfig, [key]: enabled };
    updateGlobalConfig(next);
  }, []);

  const toggleModule = useCallback((key: keyof HomeModulesConfig) => {
    const next = { ...currentConfig, [key]: !currentConfig[key] };
    updateGlobalConfig(next);
  }, []);

  const resetDefaults = useCallback(() => {
    updateGlobalConfig(DEFAULT_HOME_MODULES);
  }, []);

  return {
    config,
    setModule,
    toggleModule,
    resetDefaults,
  };
}
