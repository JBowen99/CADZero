import type { OpNode } from "~/types";

export function buildPreviewCode(
  code: string,
  op: OpNode,
  language: "openscad" | "build123d",
): string | null {
  if (language === "openscad") return buildScadPreviewCode(code, op);
  return buildBuild123dPreviewCode(code, op);
}

function findModuleName(
  lines: string[],
  opLine: number,
): { name: string; endLine: number } | null {
  const m0 = /module\s+(\w+)/.exec(lines[opLine]);
  if (m0) return { name: m0[1], endLine: opLine };

  for (let i = opLine; i >= 0; i--) {
    const m = /module\s+(\w+)/.exec(lines[i]);
    if (m) return { name: m[1], endLine: opLine };
  }

  for (let i = opLine + 1; i < Math.min(opLine + 4, lines.length); i++) {
    const m = /module\s+(\w+)/.exec(lines[i]);
    if (m) {
      let endLine = i;
      if (lines[i].includes("{")) {
        let depth = 0;
        let found = false;
        for (let j = i; j < lines.length; j++) {
          for (let k = 0; k < lines[j].length; k++) {
            if (lines[j][k] === "{") depth++;
            else if (lines[j][k] === "}") {
              depth--;
              if (depth === 0) {
                endLine = j;
                found = true;
                break;
              }
            }
          }
          if (found) break;
        }
      }
      return { name: m[1], endLine };
    }
  }

  return null;
}

function buildScadPreviewCode(code: string, op: OpNode): string | null {
  const lines = code.split("\n");
  const found = findModuleName(lines, op.line);
  if (!found) return null;

  const kept = lines.slice(0, found.endLine + 1);

  while (kept.length > 0) {
    const last = kept[kept.length - 1].trim();
    if (last === "" || last.startsWith("//") || last.startsWith("/*") || last.startsWith("*")) {
      kept.pop();
      continue;
    }
    if (/^\w+\(.*\);?\s*$/.test(last) && !last.startsWith("module ") && !last.startsWith("}")) {
      kept.pop();
      continue;
    }
    break;
  }

  kept.push("", `${found.name}();`);
  return kept.join("\n");
}

function buildBuild123dPreviewCode(code: string, op: OpNode): string | null {
  const lines = code.split("\n");

  let ctxVar = "ctx";
  for (const line of lines) {
    const m = /with\s+Build\w*\s*\([^)]*\)\s+as\s+(\w+)/.exec(line);
    if (m && /^\S/.test(line)) {
      ctxVar = m[1];
      break;
    }
  }

  const kept = lines.slice(0, op.line + 1);

  while (kept.length > 0 && kept[kept.length - 1].trim() === "") {
    kept.pop();
  }

  if (kept.length === 0) return null;

  const hasResult = kept.some((l) => /^\s*result\s*=/.test(l));
  if (hasResult) return kept.join("\n");

  const lastTrimmed = kept[kept.length - 1].trimEnd();
  if (lastTrimmed.endsWith(":")) {
    const indent = (kept[kept.length - 1].match(/^\s*/) ?? [""])[0];
    kept.push(indent + "    pass");
  }

  kept.push("", `result = ${ctxVar}.part`);
  return kept.join("\n");
}
