import type { OpNode, ParamDef, ParamType, ModelMeta } from "~/types";
import { normalizeOpKind } from "./op-kinds";

const OP_RE = /@op:(\w+)\s*(?:"([^"]*)")?/;
const GROUP_RE = /@group\s+(.+)/;
const PARAM_RE = /@param\s+(\w+)\s+(public|private)\s*(.*)/;
const ASSIGN_RE = /^(\w+)\s*=\s*([^#\n]+?)\s*(?:#.*)?$/;
const NUM_RE = /^[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?$/;

function parseValue(
  raw: string,
): { value: number | string | boolean; type: ParamType } | null {
  const v = raw.trim();
  if (v === "true" || v === "True") {
    return { value: true, type: "bool" };
  }
  if (v === "false" || v === "False") {
    return { value: false, type: "bool" };
  }
  if (NUM_RE.test(v)) {
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
  public: boolean;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  desc?: string;
}

function parseAnnotationFields(text: string): { public: boolean } & Omit<
  Annotation,
  "public"
> {
  const result: { public: boolean } & Omit<Annotation, "public"> = {
    public: true,
  };
  const kvRe = /(\w+)=(?:"([^"]*)"|(\S+))/g;
  let m: RegExpExecArray | null;
  while ((m = kvRe.exec(text)) !== null) {
    const key = m[1];
    const val = m[2] ?? m[3] ?? "";
    switch (key) {
      case "min":
        result.min = Number(val);
        break;
      case "max":
        result.max = Number(val);
        break;
      case "step":
        result.step = Number(val);
        break;
      case "desc":
        result.desc = val;
        break;
      case "options":
        result.options = val.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "group":
        result.group = val;
        break;
    }
  }
  return result;
}

export function extractBuild123dMeta(code: string): ModelMeta {
  const params: ParamDef[] = [];
  const ops: OpNode[] = [];
  if (!code) return { params, ops };

  const lines = code.split("\n");
  let currentGroup: string | null = null;
  let pendingParam: {
    name: string;
    isPublic: boolean;
    fields: ReturnType<typeof parseAnnotationFields>;
    line: number;
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const commentIdx = line.indexOf("#");
    const commentText = commentIdx >= 0 ? line.slice(commentIdx) : "";

    const opMatch = OP_RE.exec(commentText);
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

    const groupMatch = GROUP_RE.exec(commentText);
    if (groupMatch) {
      currentGroup = groupMatch[1].trim();
      pendingParam = null;
      continue;
    }

    const paramMatch = PARAM_RE.exec(commentText);
    if (paramMatch) {
      const [, name, scope, rest] = paramMatch;
      const fields = parseAnnotationFields(rest);
      pendingParam = {
        name,
        isPublic: scope === "public",
        fields,
        line: i,
      };
      continue;
    }

    if (!pendingParam) continue;

    const codeText = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    if (codeText.trim() === "") continue;

    if (/^\s/.test(line)) {
      pendingParam = null;
      continue;
    }

    const assignMatch = ASSIGN_RE.exec(codeText);
    if (assignMatch && assignMatch[1] === pendingParam.name) {
      const parsed = parseValue(assignMatch[2]);
      if (parsed) {
        const isChoice =
          pendingParam.fields.options &&
          pendingParam.fields.options.length > 0;
        params.push({
          name: pendingParam.name,
          value: parsed.value,
          type: isChoice ? "choice" : parsed.type,
          public: pendingParam.isPublic,
          group: pendingParam.fields.group ?? currentGroup ?? undefined,
          min: pendingParam.fields.min,
          max: pendingParam.fields.max,
          step: pendingParam.fields.step,
          options: pendingParam.fields.options,
          desc: pendingParam.fields.desc,
          line: i,
        });
      }
      pendingParam = null;
    } else {
      pendingParam = null;
    }
  }

  return { params, ops };
}
