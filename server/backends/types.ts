export interface RenderResult {
  ok: boolean;
  stl?: Buffer;
  stderr: string;
  durationMs: number;
}

export interface ExportResult {
  ok: boolean;
  data?: Buffer;
  stderr: string;
  durationMs: number;
}
