import type { OpKind, OpNode, ParamDef, ParamType, ScadMeta } from "~/types";

const OP_KINDS: ReadonlySet<string> = new Set([
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

const SECTION_RE = /\/\*\s*\[([^\]]+)\]\s*\*\//;
const OP_RE = /@op:(\w+)\s*(?:"([^"]*)")?/;
const ASSIGN_RE = /^(\w+)\s*=\s*([^;]+);(.*)$/;
const NUM_RE = /^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$/;

function normalizeOpKind(raw: string): OpKind {
  const lower = raw.toLowerCase();
  return OP_KINDS.has(lower) ? (lower as OpKind) : "other";
}

function isNumberLiteral(s: string): boolean {
  return NUM_RE.test(s.trim());
}

function parseValue(
  raw: string,
): { value: number | string | boolean; type: ParamType } | null {
  const v = raw.trim();
  if (v === "true" || v === "false") {
    return { value: v === "true", type: "bool" };
  }
  if (isNumberLiteral(v)) {
    const num = Number(v);
    return Number.isFinite(num) ? { value: num, type: "number" } : null;
  }
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return { value: v.slice(1, -1), type: "string" };
  }
  return null;
}

interface Annotation {
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

function parseAnnotation(inner: string): Annotation {
  const t = inner.trim();
  if (!t) return {};
  if (/^[-+]?\d*\.?\d+(?::[-+]?\d*\.?\d+){1,2}$/.test(t)) {
    const parts = t.split(":").map(Number);
    if (parts.length === 3) {
      return { min: parts[0], step: parts[1], max: parts[2] };
    }
    if (parts.length === 2) {
      return { min: parts[0], max: parts[1] };
    }
  }
  if (t.includes(",")) {
    return { options: t.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  return { options: [t] };
}

function extractTrailingAnnotation(trailing: string): Annotation | null {
  const m = /\[([^\]]*)\]/.exec(trailing);
  return m ? parseAnnotation(m[1]) : null;
}

function netBraces(line: string): number {
  let depth = 0;
  let inString: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inString) {
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === inString) inString = null;
      continue;
    }
    if (ch === "/" && line[i + 1] === "/") break;
    if (ch === '"' || ch === "'") {
      inString = ch;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
  }
  return depth;
}

export function extractScadMeta(code: string): ScadMeta {
  const params: ParamDef[] = [];
  const ops: OpNode[] = [];
  if (!code) return { params, ops };

  const lines = code.split("\n");
  let currentGroup: string | null = null;
  let pendingDesc: string | null = null;
  let depth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const opMatch = OP_RE.exec(line);
    if (opMatch) {
      ops.push({
        id: `op-${i}`,
        kind: normalizeOpKind(opMatch[1]),
        rawKind: opMatch[1].toLowerCase(),
        name: opMatch[2]?.trim() || opMatch[1],
        order: ops.length,
        line: i,
      });
    }

    const sectionMatch = SECTION_RE.exec(line);
    if (sectionMatch) {
      const name = sectionMatch[1].trim();
      currentGroup = name.toLowerCase() === "hidden" ? null : name;
      pendingDesc = null;
      depth += netBraces(line);
      continue;
    }

    depth += netBraces(line);
    if (depth !== 0) {
      pendingDesc = null;
      continue;
    }

    if (trimmed === "") {
      pendingDesc = null;
      continue;
    }

    if (trimmed.startsWith("//")) {
      if (!OP_RE.test(trimmed)) {
        pendingDesc = trimmed.replace(/^\/\//, "").trim();
      }
      continue;
    }

    const assignMatch = ASSIGN_RE.exec(trimmed);
    if (assignMatch) {
      const [, name, rhsRaw, trailing] = assignMatch;
      const parsed = parseValue(rhsRaw);
      if (parsed) {
        const annotation = extractTrailingAnnotation(trailing);
        const isChoice = annotation?.options && annotation.options.length > 0;
        let type = parsed.type;
        if (isChoice) type = "choice";
        params.push({
          name,
          value: parsed.value,
          type,
          public: currentGroup !== null,
          group: currentGroup ?? undefined,
          min: annotation?.min,
          max: annotation?.max,
          step: annotation?.step,
          options: annotation?.options,
          desc: pendingDesc ?? undefined,
          line: i,
        });
      }
      pendingDesc = null;
    } else {
      pendingDesc = null;
    }
  }

  return { params, ops };
}

export const EMPTY_SCAD_META: ScadMeta = { params: [], ops: [] };
