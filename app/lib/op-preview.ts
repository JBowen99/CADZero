import type { OpNode } from "~/types";

export function buildPreviewCode(
  code: string,
  op: OpNode,
  language: "openscad" | "build123d",
): string | null {
  if (language === "openscad") return buildScadPreviewCode(code, op);
  return null;
}

function findModuleName(lines: string[], opLine: number): { name: string; line: number } | null {
  if (opLine >= 0 && opLine < lines.length) {
    const m = /module\s+(\w+)/.exec(lines[opLine]);
    if (m) return { name: m[1], line: opLine };
  }
  for (let i = opLine + 1; i < Math.min(opLine + 3, lines.length); i++) {
    const m = /module\s+(\w+)/.exec(lines[i]);
    if (m) return { name: m[1], line: i };
  }
  for (let i = opLine; i >= 0; i--) {
    const m = /module\s+(\w+)/.exec(lines[i]);
    if (m) return { name: m[1], line: i };
  }
  return null;
}

function buildScadPreviewCode(code: string, op: OpNode): string | null {
  const lines = code.split("\n");
  const found = findModuleName(lines, op.line);
  if (!found) return null;

  const kept = lines.slice(0, found.line + 1);

  while (kept.length > 0) {
    const last = kept[kept.length - 1].trim();
    if (last === "" || last.startsWith("//") || last.startsWith("/*") || last.startsWith("*")) {
      kept.pop();
      continue;
    }
    if (/^\w+\(.*\);?\s*$/.test(last) && !last.startsWith("module ")) {
      kept.pop();
      continue;
    }
    break;
  }

  kept.push("", `${found.name}();`);
  return kept.join("\n");
}
