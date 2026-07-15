import { contextBridge } from "electron";

export type ElectronAPI = {
  readonly isElectron: true;
};

const api: ElectronAPI = {
  isElectron: true,
};

contextBridge.exposeInMainWorld("electronAPI", api);
