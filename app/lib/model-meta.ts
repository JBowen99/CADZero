import type { BackendName, ModelMeta } from "~/types";
import { extractScadMeta } from "./scad-meta";
import { patchScadParam } from "./scad-patcher";
import { extractBuild123dMeta } from "./build123d-meta";
import { patchBuild123dParam } from "./build123d-patcher";

export function extractMeta(code: string, language: BackendName): ModelMeta {
  return language === "build123d"
    ? extractBuild123dMeta(code)
    : extractScadMeta(code);
}

export function patchParam(
  code: string,
  name: string,
  value: number | string | boolean,
  language: BackendName,
): string {
  return language === "build123d"
    ? patchBuild123dParam(code, name, value)
    : patchScadParam(code, name, value);
}
