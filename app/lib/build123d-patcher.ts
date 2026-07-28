export function formatBuild123dValue(value: number | string | boolean): string {
  if (typeof value === "string") {
    return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  if (typeof value === "boolean") return value ? "True" : "False";
  return String(value);
}

const ASSIGN_LINE_RE = /^(\w+)(\s*=\s*)([^#\n]+?)(\s*(?:#.*)?)$/;

export function patchBuild123dParam(
  code: string,
  name: string,
  value: number | string | boolean,
): string {
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s/.test(line)) continue;
    const commentIdx = line.indexOf("#");
    const codeText = commentIdx >= 0 ? line.slice(0, commentIdx) : line;
    const m = ASSIGN_LINE_RE.exec(codeText);
    if (!m || m[1] !== name) continue;
    const suffix = commentIdx >= 0 ? "  " + line.slice(commentIdx) : (m[4] ?? "");
    lines[i] = m[1] + m[2] + formatBuild123dValue(value) + suffix;
    return lines.join("\n");
  }
  return code;
}
