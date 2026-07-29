export function formatScadValue(value: number | string | boolean): string {
  if (typeof value === "string") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

const ASSIGN_LINE_RE = /^(\s*)(\w+)(\s*=\s*)([^;\n]+)(;.*)$/;

export function patchScadParam(
  code: string,
  name: string,
  value: number | string | boolean,
): string {
  const lines = code.split("\n");
  let depth = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = ASSIGN_LINE_RE.exec(line);
    depth += netBraces(line);
    if (!m || m[2] !== name) continue;
    if (depth !== 0) continue;
    lines[i] = m[1] + m[2] + m[3] + formatScadValue(value) + m[5];
    return lines.join("\n");
  }
  return code;
}

function netBraces(line: string): number {
  let d = 0;
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
    if (ch === "{") d++;
    else if (ch === "}") d--;
  }
  return d;
}
