import { create } from "zustand";
import type {
  AppSettings,
  BackendName,
  LightingSettings,
  ViewMode,
} from "~/types";
import { settingsUrl } from "~/lib/api";

export interface AvailableModel {
  id: string;
  name: string;
  supportsVision?: boolean;
}

export const DEFAULT_VIEW_MODE: ViewMode = "solid";

export const DEFAULT_LIGHTING: LightingSettings = {
  ambientIntensity: 1.0,
  directionalIntensity: 0.5,
  azimuth: 53,
  elevation: 50,
  roughness: 0.95,
  metalness: 0,
  rimLight: false,
  rimIntensity: 0.3,
};

interface SettingsState {
  model: string | null;
  defaultBackend: BackendName | null;
  viewMode: ViewMode;
  lighting: LightingSettings;
  lastOpenDocIds: string[];
  loaded: boolean;
  load: () => Promise<void>;
  setModel: (id: string | null) => void;
  setDefaultBackend: (backend: BackendName) => void;
  setViewMode: (mode: ViewMode) => void;
  setLighting: (patch: Partial<LightingSettings>) => void;
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
        defaultBackend: s.defaultBackend ?? undefined,
        viewMode: s.viewMode,
        lighting: s.lighting,
        lastOpenDocIds: s.lastOpenDocIds,
      } satisfies AppSettings),
    }).catch(() => {
      /* settings persistence is best-effort */
    });
  }, 400);
}

export const useSettingsStore = create<SettingsState>((set) => ({
  model: null,
  defaultBackend: null,
  viewMode: DEFAULT_VIEW_MODE,
  lighting: DEFAULT_LIGHTING,
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
        defaultBackend: data.defaultBackend ?? null,
        viewMode: data.viewMode ?? DEFAULT_VIEW_MODE,
        lighting: { ...DEFAULT_LIGHTING, ...(data.lighting ?? {}) },
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

  setDefaultBackend: (backend) => {
    set({ defaultBackend: backend });
    scheduleSave();
  },

  setViewMode: (mode) => {
    set({ viewMode: mode });
    scheduleSave();
  },

  setLighting: (patch) => {
    set((s) => ({ lighting: { ...s.lighting, ...patch } }));
    scheduleSave();
  },

  setOpenDocOrder: (ids) => {
    const next = ids.filter((id, i) => id !== null && ids.indexOf(id) === i).slice(0, 12);
    set({ lastOpenDocIds: next });
    scheduleSave();
  },
}));

export const selectedModelId = () => useSettingsStore.getState().model;
