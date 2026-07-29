import type { BackendName } from "~/types";
import { extractScadMeta } from "./scad-meta";

export function toggleParamVisibility(
  code: string,
  paramName: string,
  language: BackendName,
): string {
  return language === "build123d"
    ? toggleBuild123dParamVisibility(code, paramName)
    : toggleScadParamVisibility(code, paramName);
}

function toggleBuild123dParamVisibility(
  code: string,
  paramName: string,
): string {
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const re = new RegExp(
      `(#\\s*@param\\s+${escapeRegex(paramName)}\\s+)(public|private)`,
    );
    const m = re.exec(lines[i]);
    if (m) {
      const next = m[2] === "public" ? "private" : "public";
      lines[i] = lines[i].slice(0, m.index!) + m[1] + next + lines[i].slice(m.index! + m[0].length);
      return lines.join("\n");
    }
  }
  return code;
}

function toggleScadParamVisibility(code: string, paramName: string): string {
  const meta = extractScadMeta(code);
  const param = meta.params.find((p) => p.name === paramName);
  if (!param) return code;

  const lines = code.split("\n");
  const assignIdx = param.line;

  let descStart = assignIdx;
  while (
    descStart > 0 &&
    lines[descStart - 1].trim().startsWith("//") &&
    !lines[descStart - 1].includes("[")
  ) {
    descStart--;
  }

  const block = lines.slice(descStart, assignIdx + 1);
  const without = [
    ...lines.slice(0, descStart),
    ...lines.slice(assignIdx + 1),
  ];

  const sectionRe = /\/\*\s*\[([^\]]+)\]\s*\*\//;
  let insertIdx = -1;

  for (let i = 0; i < without.length; i++) {
    const m = sectionRe.exec(without[i]);
    if (!m) continue;
    const name = m[1].trim().toLowerCase();
    if (param.public && name === "hidden") {
      insertIdx = i + 1;
      break;
    }
    if (!param.public && name !== "hidden") {
      insertIdx = i + 1;
      break;
    }
  }

  if (insertIdx === -1) {
    const wantHidden = param.public;
    const header = wantHidden
      ? "/* [Hidden] */"
      : "/* [Parameters] */";
    let anchor = without.length;
    for (let i = 0; i < without.length; i++) {
      if (/^\s*module\s/.test(without[i])) {
        anchor = i;
        break;
      }
    }
    if (anchor > 0 && without[anchor - 1].trim() === "") anchor--;
    without.splice(anchor, 0, header);
    insertIdx = anchor + 1;
  }

  without.splice(insertIdx, 0, ...block);

  return pruneEmptySections(without).join("\n");
}

const PRUNE_SECTION_RE = /\/\*\s*\[([^\]]+)\]\s*\*\//;

// Removes section headers left empty by a move, in a single pass with no
// in-place mutation during iteration. A header is "empty" when the line
// immediately after it is blank, another section header, or EOF. The
// following blank line (if any) is dropped too, and any double blanks or
// leading/trailing blanks left behind are collapsed.
function pruneEmptySections(lines: string[]): string[] {
  const drop = new Set<number>();
  for (let i = 0; i < lines.length; i++) {
    if (!PRUNE_SECTION_RE.test(lines[i])) continue;
    const next = lines[i + 1];
    const isEmpty =
      next === undefined || next.trim() === "" || PRUNE_SECTION_RE.test(next);
    if (!isEmpty) continue;
    drop.add(i);
    if (next !== undefined && next.trim() === "") drop.add(i + 1);
  }
  if (drop.size === 0) return lines;

  const kept: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (drop.has(i)) continue;
    const line = lines[i];
    if (
      line.trim() === "" &&
      kept[kept.length - 1]?.trim() === ""
    ) {
      continue;
    }
    kept.push(line);
  }
  while (kept.length > 0 && kept[0].trim() === "") kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === "") kept.pop();
  return kept;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
