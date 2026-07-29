import type { OpKind } from "~/types";

export const OP_KINDS: ReadonlySet<string> = new Set([
  "sketch",
  "extrude",
  "cut",
  "revolve",
  "fillet",
  "chamfer",
  "pattern",
  "shell",
  "hole",
  "offset",
  "hull",
  "union",
  "intersection",
  "mirror",
  "rotate",
  "translate",
  "scale",
  "final",
]);

export function normalizeOpKind(raw: string): OpKind {
  const lower = raw.toLowerCase();
  return OP_KINDS.has(lower) ? (lower as OpKind) : "other";
}
