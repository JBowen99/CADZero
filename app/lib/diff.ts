export type DiffOp = "equal" | "added" | "removed";

export interface DiffLine {
  op: DiffOp;
  text: string;
  /** 1-based line number in the previous snippet (equal/removed). */
  oldNo: number | null;
  /** 1-based line number in the next snippet (equal/added). */
  newNo: number | null;
}

export interface DiffResult {
  lines: DiffLine[];
  added: number;
  removed: number;
}

/**
 * Whole-line LCS diff between two snippets. Emits a unified line stream with
 * added/removed/equal ops and old/new line numbers. Dependency-free; fine for
 * chat-generated CAD code (hundreds of lines).
 */
export function computeDiff(prev: string, next: string): DiffResult {
  const a = prev.length === 0 ? [] : prev.split("\n");
  const b = next.length === 0 ? [] : next.split("\n");
  const m = a.length;
  const n = b.length;

  if (m === 0 && n === 0) return { lines: [], added: 0, removed: 0 };
  if (m === 0) {
    return {
      lines: b.map((text, j) => ({
        op: "added" as const,
        text,
        oldNo: null,
        newNo: j + 1,
      })),
      added: n,
      removed: 0,
    };
  }
  if (n === 0) {
    return {
      lines: a.map((text, i) => ({
        op: "removed" as const,
        text,
        oldNo: i + 1,
        newNo: null,
      })),
      added: 0,
      removed: m,
    };
  }

  const width = n + 1;
  const dp = new Array<number>((m + 1) * width).fill(0);
  const idx = (i: number, j: number) => i * width + j;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[idx(i, j)] =
        a[i] === b[j]
          ? dp[idx(i + 1, j + 1)] + 1
          : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)]);
    }
  }

  const lines: DiffLine[] = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  let oldNo = 1;
  let newNo = 1;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      lines.push({ op: "equal", text: a[i], oldNo: oldNo++, newNo: newNo++ });
      i++;
      j++;
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      lines.push({ op: "removed", text: a[i], oldNo: oldNo++, newNo: null });
      removed++;
      i++;
    } else {
      lines.push({ op: "added", text: b[j], oldNo: null, newNo: newNo++ });
      added++;
      j++;
    }
  }
  while (i < m) {
    lines.push({ op: "removed", text: a[i], oldNo: oldNo++, newNo: null });
    removed++;
    i++;
  }
  while (j < n) {
    lines.push({ op: "added", text: b[j], oldNo: null, newNo: newNo++ });
    added++;
    j++;
  }
  return { lines, added, removed };
}
