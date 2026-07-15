import { create } from "zustand";
import type {
  BackendName,
  ExportFormat,
  ExportResult,
  MeshDescriptor,
} from "~/types";
import { dummyBackend, resetDummyState } from "~/dummy/ai";

interface ModelState {
  mesh: MeshDescriptor | null;
  cadCode: string | null;
  language: BackendName;
  backend: BackendName;
  isExporting: boolean;
  setBackend: (b: BackendName) => void;
  setMesh: (mesh: MeshDescriptor, cadCode: string, language: BackendName) => void;
  exportModel: (format: ExportFormat) => Promise<ExportResult>;
  clear: () => void;
}

export const useModelStore = create<ModelState>((set, get) => ({
  mesh: null,
  cadCode: null,
  language: "openscad",
  backend: "openscad",
  isExporting: false,

  setBackend: (b) => {
    dummyBackend.setBackend(b);
    set({ backend: b });
  },

  setMesh: (mesh, cadCode, language) => set({ mesh, cadCode, language }),

  exportModel: async (format) => {
    set({ isExporting: true });
    try {
      return await dummyBackend.export(format);
    } finally {
      set({ isExporting: false });
    }
  },

  clear: () => {
    resetDummyState();
    set({ mesh: null, cadCode: null });
  },
}));

export const currentBackend = () => useModelStore.getState().backend;
