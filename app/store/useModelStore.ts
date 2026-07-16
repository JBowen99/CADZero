import { create } from "zustand";
import type {
  BackendName,
  ExportFormat,
  ExportResult,
  TriangleMesh,
} from "~/types";
import { exportUrl } from "~/lib/api";
import { downloadBlob, sanitizeFileName } from "~/lib/utils";

export interface ExportContext {
  partId: string;
  revId?: string | null;
  name?: string | null;
}

interface ModelState {
  mesh: TriangleMesh | null;
  cadCode: string | null;
  language: BackendName;
  backend: BackendName;
  isExporting: boolean;
  exportJob: { filename: string; format: ExportFormat } | null;
  isBuilding: boolean;
  setBackend: (b: BackendName) => void;
  setModel: (
    mesh: TriangleMesh,
    cadCode: string,
    language: BackendName,
  ) => void;
  setCode: (cadCode: string, language: BackendName) => void;
  setBuilding: (building: boolean) => void;
  exportModel: (format: ExportFormat, ctx: ExportContext) => Promise<ExportResult>;
  clear: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  mesh: null,
  cadCode: null,
  language: "openscad",
  backend: "openscad",
  isExporting: false,
  exportJob: null,
  isBuilding: false,

  setBackend: (b) => set({ backend: b }),

  setModel: (mesh, cadCode, language) => set({ mesh, cadCode, language }),

  setCode: (cadCode, language) => set({ cadCode, language, mesh: null }),

  setBuilding: (building) => set({ isBuilding: building }),

  exportModel: async (format, ctx) => {
    const filename = `${sanitizeFileName(ctx.name ?? "model")}.${format}`;
    set({ isExporting: true, exportJob: { filename, format } });
    try {
      const res = await fetch(
        exportUrl(ctx.partId, format, ctx.revId ?? undefined),
      );
      if (!res.ok) {
        let detail = `Export failed (status ${res.status})`;
        try {
          const body = (await res.json()) as {
            error?: string;
            stderr?: string;
          };
          if (body?.stderr) detail = body.stderr;
          else if (body?.error) detail = body.error;
        } catch {
          /* not JSON */
        }
        throw new Error(detail);
      }
      const blob = await res.blob();
      downloadBlob(blob, filename);
      return { format, sizeBytes: blob.size, filename };
    } finally {
      set({ isExporting: false, exportJob: null });
    }
  },

  clear: () => set({ mesh: null, cadCode: null }),
}));

export const currentBackend = () => useModelStore.getState().backend;
