import { create } from "zustand";

export interface AvailableModel {
  id: string;
  name: string;
}

interface SettingsState {
  model: string | null;
  setModel: (id: string | null) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  model: null,
  setModel: (id) => set({ model: id }),
}));

export const selectedModelId = () => useSettingsStore.getState().model;
