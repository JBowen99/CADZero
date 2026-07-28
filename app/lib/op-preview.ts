import type { OpNode } from "~/types";

export function buildPreviewCode(
  code: string,
  op: OpNode,
  language: "openscad" | "build123d",
): string | null {
  if (language === "openscad") return buildScadPreviewCode(code, op);
  return null;
}

function buildScadPreviewCode(code: string, op: OpNode): string | null {
  if (!op.moduleName) return null;
  const lines = code.split("\n");
  const kept = lines.slice(0, op.line + 1);

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

  kept.push("", `${op.moduleName}();`);
  return kept.join("\n");
}
