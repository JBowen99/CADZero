import { useEffect, useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { DiffLine } from "~/lib/diff";
import { cn } from "~/lib/utils";

/** Equal lines shown on each side of a change before collapsing the rest. */
const CONTEXT = 3;

type Segment =
  | { kind: "line"; line: DiffLine }
  | { kind: "gap"; id: number; lines: DiffLine[] };

/**
 * Groups equal lines that are farther than `context` from any change into
 * collapsible "gap" segments. Lines within `context` of a change stay visible.
 */
function buildSegments(lines: DiffLine[], context: number): Segment[] {
  const n = lines.length;
  if (n === 0) return [];

  // Distance to the nearest changed line (op !== "equal"), scanned both ways.
  const dist = new Array<number>(n).fill(Infinity);
  let last = Infinity;
  for (let i = 0; i < n; i++) {
    if (lines[i].op !== "equal") last = 0;
    else if (last !== Infinity) last++;
    dist[i] = last;
  }
  last = Infinity;
  for (let i = n - 1; i >= 0; i--) {
    if (lines[i].op !== "equal") last = 0;
    else if (last !== Infinity) last++;
    dist[i] = Math.min(dist[i], last);
  }

  const segments: Segment[] = [];
  let gapId = 0;
  let i = 0;
  while (i < n) {
    if (lines[i].op === "equal" && dist[i] > context) {
      const start = i;
      while (i < n && lines[i].op === "equal" && dist[i] > context) i++;
      segments.push({ kind: "gap", id: gapId++, lines: lines.slice(start, i) });
    } else {
      segments.push({ kind: "line", line: lines[i] });
      i++;
    }
  }
  return segments;
}

export function DiffView({ lines }: { lines: DiffLine[] }) {
  const segments = useMemo(() => buildSegments(lines, CONTEXT), [lines]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Reset expansions when the underlying diff changes.
  useEffect(() => {
    setExpanded(new Set());
  }, [lines]);

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="overflow-x-auto">
      <div className="w-max min-w-full font-mono text-xs leading-relaxed">
        {segments.map((seg, idx) => {
          if (seg.kind === "line") {
            return <DiffRow key={idx} line={seg.line} />;
          }
          if (expanded.has(seg.id)) {
            return seg.lines.map((l, k) => (
              <DiffRow key={`${idx}-${k}`} line={l} />
            ));
          }
          return (
            <button
              key={idx}
              type="button"
              onClick={() => toggle(seg.id)}
              className="flex min-w-full items-center justify-center gap-1.5 border-y bg-muted/50 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-muted"
            >
              <ChevronDown className="size-3" />
              Show {seg.lines.length} unchanged{" "}
              {seg.lines.length === 1 ? "line" : "lines"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DiffRow({ line }: { line: DiffLine }) {
  const sign = line.op === "added" ? "+" : line.op === "removed" ? "−" : " ";
  return (
    <div
      className={cn(
        "flex min-w-full",
        line.op === "added" && "bg-emerald-500/15",
        line.op === "removed" && "bg-destructive/15",
      )}
    >
      <span
        className={cn(
          "w-6 shrink-0 select-none border-r px-1 text-center",
          line.op === "added" && "text-emerald-600 dark:text-emerald-400",
          line.op === "removed" && "text-destructive",
          line.op === "equal" && "text-muted-foreground/40",
        )}
      >
        {sign}
      </span>
      <span className="shrink-0 whitespace-pre px-2 text-foreground">
        {line.text || "\u00A0"}
      </span>
    </div>
  );
}
