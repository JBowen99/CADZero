export interface LineDiffResult {
  added: number;
  removed: number;
}

/**
 * Counts added/removed lines between two snippets using an LCS over whole
 * lines. Dependency-free; fine for chat-generated CAD code (hundreds of lines).
 */
export function lineDiff(prev: string, next: string): LineDiffResult {
  const a = prev.length === 0 ? [] : prev.split("\n");
  const b = next.length === 0 ? [] : next.split("\n");
  const m = a.length;
  const n = b.length;

  if (m === 0) return { added: n, removed: 0 };
  if (n === 0) return { added: 0, removed: m };

  const dp: number[] = new Array((m + 1) * (n + 1));
  const idx = (i: number, j: number) => i * (n + 1) + j;
  for (let i = m; i >= 0; i--) dp[idx(i, n)] = 0;
  for (let j = n; j >= 0; j--) dp[idx(m, j)] = 0;
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[idx(i, j)] =
        a[i] === b[j]
          ? dp[idx(i + 1, j + 1)] + 1
          : Math.max(dp[idx(i + 1, j)], dp[idx(i, j + 1)]);
    }
  }

  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else if (dp[idx(i + 1, j)] >= dp[idx(i, j + 1)]) {
      removed++;
      i++;
    } else {
      added++;
      j++;
    }
  }
  removed += m - i;
  added += n - j;
  return { added, removed };
}
