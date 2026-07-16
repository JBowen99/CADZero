import { contextBridge, ipcRenderer } from "electron";

export type ElectronAPI = {
  readonly isElectron: true;
  minimize: () => void;
  toggleMaximize: () => void;
  close: () => void;
  isMaximized: () => Promise<boolean>;
  onMaximizeChange: (cb: (maximized: boolean) => void) => () => void;
};

const api: ElectronAPI = {
  isElectron: true,
  minimize: () => ipcRenderer.send("window:minimize"),
  toggleMaximize: () => ipcRenderer.send("window:toggle-maximize"),
  close: () => ipcRenderer.send("window:close"),
  isMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  onMaximizeChange: (cb) => {
    const listener = (_e: unknown, maximized: boolean) => cb(maximized);
    ipcRenderer.on("window:maximize-change", listener);
    return () => {
      ipcRenderer.off("window:maximize-change", listener);
    };
  },
};

contextBridge.exposeInMainWorld("electronAPI", api);
