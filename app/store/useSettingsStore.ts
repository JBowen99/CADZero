import { create } from "zustand";
import type { AppSettings } from "~/types";
import { settingsUrl } from "~/lib/api";

export interface AvailableModel {
  id: string;
  name: string;
  supportsVision?: boolean;
}

interface SettingsState {
  model: string | null;
  lastOpenDocIds: string[];
  loaded: boolean;
  load: () => Promise<void>;
  setModel: (id: string | null) => void;
  setOpenDocOrder: (ids: string[]) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleSave(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const s = useSettingsStore.getState();
    void fetch(settingsUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: s.model,
        lastOpenDocIds: s.lastOpenDocIds,
      } satisfies AppSettings),
    }).catch(() => {
      /* settings persistence is best-effort */
    });
  }, 400);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  model: null,
  lastOpenDocIds: [],
  loaded: false,

  load: async () => {
    try {
      const res = await fetch(settingsUrl);
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const data: AppSettings = await res.json();
      set({
        model: data.model ?? null,
        lastOpenDocIds: data.lastOpenDocIds ?? [],
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setModel: (id) => {
    set({ model: id });
    scheduleSave();
  },

  setOpenDocOrder: (ids) => {
    const next = ids.filter((id, i) => id !== null && ids.indexOf(id) === i).slice(0, 12);
    set({ lastOpenDocIds: next });
    scheduleSave();
  },
}));

export const selectedModelId = () => useSettingsStore.getState().model;
