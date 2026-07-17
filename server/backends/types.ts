import type { TriangleMesh } from "../renderer/stl";
import type { Topology } from "../renderer/topology";

export interface RenderResult {
  ok: boolean;
  mesh?: TriangleMesh;
  topology?: Topology | null;
  stderr: string;
  durationMs: number;
}

export interface ExportResult {
  ok: boolean;
  data?: Buffer;
  stderr: string;
  durationMs: number;
}
