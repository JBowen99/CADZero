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
    const m = ASSIGN_LINE_RE.exec(line);
    if (!m || m[1] !== name) continue;
    lines[i] = m[1] + m[2] + formatBuild123dValue(value) + (m[4] ?? "");
    return lines.join("\n");
  }
  return code;
}
