import type { BackendName } from "../backend-types";
import { exportScad, renderScad } from "./openscad";
import { exportBuild123d, renderBuild123d } from "./build123d";
import type { ExportResult, RenderResult } from "./types";

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
