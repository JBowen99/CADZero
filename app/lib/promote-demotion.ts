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

  for (let i = without.length - 1; i >= 1; i--) {
    const m = sectionRe.exec(without[i]);
    if (!m) continue;
    const prev = without[i - 1];
    const next = without[i + 1];
    const nextIsSection = next && sectionRe.test(next);
    const nextIsBlank = !next || next.trim() === "";
    if ((nextIsSection || nextIsBlank) && (prev.trim() === "" || sectionRe.test(prev))) {
      if (next && next.trim() === "") without.splice(i + 1, 1);
      without.splice(i, 1);
      if (i > 0 && without[i - 1].trim() === "" && i < without.length) {
        without.splice(i - 1, 1);
      }
    }
  }

  return without.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
