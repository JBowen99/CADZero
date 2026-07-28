import type { BackendName } from "../backend-types";
import { exportScad, renderScad } from "./openscad";
import {
  exportBuild123d,
  measureBuild123d,
  renderBuild123d,
  type MeasureOutput,
} from "./build123d";
import type { ExportResult, RenderResult } from "./types";
import type { MeasureMode, MeasurePick } from "../renderer/topology";

export function renderFor(
  language: BackendName,
  code: string,
): Promise<RenderResult> {
  return language === "build123d"
    ? renderBuild123d(code)
    : renderScad(code);
}

export function exportFor(
  language: BackendName,
  code: string,
  ext: string,
): Promise<ExportResult> {
  return language === "build123d"
    ? exportBuild123d(code, ext)
    : exportScad(code, ext);
}

export function measureFor(
  language: BackendName,
  code: string,
  picks: MeasurePick[],
  mode: MeasureMode,
): Promise<MeasureOutput> {
  // OpenSCAD has no B-rep — measurement is gated to build123d on the API layer,
  // so a request landing here for openscad is a programmer error.
  if (language !== "build123d") {
    return Promise.resolve({
      ok: false,
      results: [],
      stderr: "Measurement requires a Build123D part (B-rep kernel).",
      durationMs: 0,
    });
  }
  return measureBuild123d(code, picks, mode);
}
