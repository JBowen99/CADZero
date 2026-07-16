import { create } from "zustand";
import type {
  BackendName,
  ExportFormat,
  ExportResult,
  TriangleMesh,
} from "~/types";

interface ModelState {
  mesh: TriangleMesh | null;
  cadCode: string | null;
  language: BackendName;
  backend: BackendName;
  isExporting: boolean;
  isBuilding: boolean;
  setBackend: (b: BackendName) => void;
  setModel: (
    mesh: TriangleMesh,
    cadCode: string,
    language: BackendName,
  ) => void;
  setCode: (cadCode: string, language: BackendName) => void;
  setBuilding: (building: boolean) => void;
  exportModel: (format: ExportFormat) => Promise<ExportResult>;
  clear: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  mesh: null,
  cadCode: null,
  language: "openscad",
  backend: "openscad",
  isExporting: false,
  isBuilding: false,

  setBackend: (b) => set({ backend: b }),

  setModel: (mesh, cadCode, language) => set({ mesh, cadCode, language }),

  setCode: (cadCode, language) => set({ cadCode, language, mesh: null }),

  setBuilding: (building) => set({ isBuilding: building }),

  exportModel: async (format) => {
    set({ isExporting: true });
    try {
      const sizeBytes = 1024 + Math.round(Math.random() * 24000);
      return { format, sizeBytes, filename: `model.${format}` };
    } finally {
      set({ isExporting: false });
    }
  },

  clear: () => set({ mesh: null, cadCode: null }),
}));

export const currentBackend = () => useModelStore.getState().backend;
