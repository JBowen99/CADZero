import { useEffect, useState } from "react";

type ElectronWindowAPI = {
  isElectron: true;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
};

function getAPI(): ElectronWindowAPI | null {
  if (typeof window === "undefined") return null;
  const api = (window as { electronAPI?: unknown }).electronAPI;
  if (api && typeof api === "object" && (api as { isElectron?: boolean }).isElectron) {
    return api as ElectronWindowAPI;
  }
  return null;
}

export function useElectronWindow() {
  const api = getAPI();
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!api) return;
    let active = true;
    void api.isMaximized().then((m) => {
      if (active) setMaximized(m);
    });
    const off = api.onMaximizeChange((m) => setMaximized(m));
    return () => {
      active = false;
      off();
    };
  }, [api]);

  if (!api) {
    return {
      isElectron: false,
      maximized: false,
      minimize: () => {},
      toggleMaximize: () => {},
      close: () => {},
    };
  }

  return {
    isElectron: true as const,
    maximized,
    minimize: api.minimize,
    toggleMaximize: api.toggleMaximize,
    close: api.close,
  };
}
