import { describe, it, expect } from "vitest";
import { computeDiff } from "./diff";

describe("computeDiff", () => {
  it("returns an empty diff for two empty strings", () => {
    expect(computeDiff("", "")).toEqual({ lines: [], added: 0, removed: 0 });
  });

  it("marks the whole next snippet as added when prev is empty", () => {
    const r = computeDiff("", "a\nb");
    expect(r.added).toBe(2);
    expect(r.removed).toBe(0);
    expect(r.lines).toEqual([
      { op: "added", text: "a", oldNo: null, newNo: 1 },
      { op: "added", text: "b", oldNo: null, newNo: 2 },
    ]);
  });

  it("marks the whole prev snippet as removed when next is empty", () => {
    const r = computeDiff("a\nb", "");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(2);
    expect(r.lines).toEqual([
      { op: "removed", text: "a", oldNo: 1, newNo: null },
      { op: "removed", text: "b", oldNo: 2, newNo: null },
    ]);
  });

  it("reports no changes for identical snippets with aligned line numbers", () => {
    const r = computeDiff("a\nb\nc", "a\nb\nc");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.lines.every((l) => l.op === "equal")).toBe(true);
    expect(r.lines.map((l) => [l.oldNo, l.newNo])).toEqual([
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });

  it("emits a single removed + added pair for a replaced line", () => {
    const r = computeDiff("a\nb\nc", "a\nx\nc");
    expect(r.added).toBe(1);
    expect(r.removed).toBe(1);
    expect(r.lines.map((l) => l.op)).toEqual([
      "equal",
      "removed",
      "added",
      "equal",
    ]);
    expect(r.lines[1]).toEqual({ op: "removed", text: "b", oldNo: 2, newNo: null });
    expect(r.lines[2]).toEqual({ op: "added", text: "x", oldNo: null, newNo: 2 });
  });

  it("detects a pure insertion and keeps surrounding line numbers stable", () => {
    const r = computeDiff("a\nc", "a\nb\nc");
    expect(r.added).toBe(1);
    expect(r.removed).toBe(0);
    expect(r.lines).toEqual([
      { op: "equal", text: "a", oldNo: 1, newNo: 1 },
      { op: "added", text: "b", oldNo: null, newNo: 2 },
      { op: "equal", text: "c", oldNo: 2, newNo: 3 },
    ]);
  });

  it("detects a pure deletion", () => {
    const r = computeDiff("a\nb\nc", "a\nc");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(1);
    expect(r.lines).toEqual([
      { op: "equal", text: "a", oldNo: 1, newNo: 1 },
      { op: "removed", text: "b", oldNo: 2, newNo: null },
      { op: "equal", text: "c", oldNo: 3, newNo: 2 },
    ]);
  });

  it("preserves LCS ordering across multiple scattered changes", () => {
    const r = computeDiff(
      ["keep1", "del1", "keep2", "del2", "keep3"].join("\n"),
      ["keep1", "add1", "keep2", "add2", "keep3"].join("\n"),
    );
    expect(r.added).toBe(2);
    expect(r.removed).toBe(2);
    expect(r.lines.map((l) => l.op)).toEqual([
      "equal", // keep1
      "removed", // del1
      "added", // add1
      "equal", // keep2
      "removed", // del2
      "added", // add2
      "equal", // keep3
    ]);
  });

  it("treats a trailing newline as its own (empty) line", () => {
    const r = computeDiff("a\n", "a\n");
    expect(r.added).toBe(0);
    expect(r.removed).toBe(0);
    expect(r.lines.map((l) => l.text)).toEqual(["a", ""]);
  });

  it("keeps old/new counters independent across a mixed edit", () => {
    const r = computeDiff("a\nb\nc\nd", "a\nb\nx\nd");
    expect(r.removed).toBe(1);
    expect(r.added).toBe(1);
    const removed = r.lines.find((l) => l.op === "removed");
    const added = r.lines.find((l) => l.op === "added");
    expect(removed?.oldNo).toBe(3);
    expect(added?.newNo).toBe(3);
  });
});
