import { create } from "zustand";
import type {
  BackendName,
  ExportFormat,
  ExportResult,
  FaceExportFormat,
  Topology,
  TriangleMesh,
} from "~/types";
import { exportFaceUrl, exportUrl } from "~/lib/api";
import { downloadBlob, sanitizeFileName } from "~/lib/utils";

export interface ExportContext {
  partId: string;
  revId?: string | null;
  name?: string | null;
}

export interface ExportJob {
  filename: string;
  format: ExportFormat | FaceExportFormat;
  kind: "model" | "face";
  subject?: string;
}

interface ModelState {
  mesh: TriangleMesh | null;
  topology: Topology | null;
  cadCode: string | null;
  language: BackendName;
  backend: BackendName;
  isExporting: boolean;
  exportJob: ExportJob | null;
  isBuilding: boolean;
  isRendering: boolean;
  setBackend: (b: BackendName) => void;
  setModel: (
    mesh: TriangleMesh,
    cadCode: string,
    language: BackendName,
    topology?: Topology | null,
  ) => void;
  setCode: (cadCode: string, language: BackendName) => void;
  setCadCode: (cadCode: string) => void;
  setBuilding: (building: boolean) => void;
  setRendering: (rendering: boolean) => void;
  exportModel: (format: ExportFormat, ctx: ExportContext) => Promise<ExportResult>;
  exportFace: (
    format: FaceExportFormat,
    faceId: string,
    ctx: ExportContext,
  ) => Promise<ExportResult>;
  clear: () => void;
}

export const useModelStore = create<ModelState>((set) => ({
  mesh: null,
  topology: null,
  cadCode: null,
  language: "openscad",
  backend: "openscad",
  isExporting: false,
  exportJob: null,
  isBuilding: false,
  isRendering: false,

  setBackend: (b) => set({ backend: b }),

  setModel: (mesh, cadCode, language, topology = null) =>
    set({ mesh, cadCode, language, topology }),

  setCode: (cadCode, language) =>
    set({ cadCode, language, mesh: null, topology: null }),

  setCadCode: (cadCode) => set({ cadCode }),

  setBuilding: (building) => set({ isBuilding: building }),

  setRendering: (rendering) => set({ isRendering: rendering }),

  exportModel: async (format, ctx) => {
    const filename = `${sanitizeFileName(ctx.name ?? "model")}.${format}`;
    set({ isExporting: true, exportJob: { filename, format, kind: "model" } });
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

  exportFace: async (format, faceId, ctx) => {
    const base = sanitizeFileName(ctx.name ?? "model");
    const filename = `${base}-Face_${faceId}.${format}`;
    set({
      isExporting: true,
      exportJob: {
        filename,
        format,
        kind: "face",
        subject: `Face ${faceId}`,
      },
    });
    try {
      const res = await fetch(
        exportFaceUrl(ctx.partId, faceId, format, ctx.revId ?? undefined),
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

  clear: () => set({ mesh: null, topology: null, cadCode: null }),
}));

export const currentBackend = () => useModelStore.getState().backend;
