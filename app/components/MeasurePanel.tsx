import { useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  ListTree,
  Loader2,
  MessageSquarePlus,
  Ruler,
  TriangleAlert,
  Undo2,
  Trash2,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useMeasureStore } from "~/store/useMeasureStore";
import type { MeasureEntity, MeasurePair, MeasureResult, MeasureKind } from "~/types";

const MODE_TABS: { value: "single" | "pair" | "chain"; label: string; icon: typeof Ruler }[] = [
  { value: "single", label: "Single", icon: Ruler },
  { value: "pair", label: "Pair", icon: ArrowLeftRight },
  { value: "chain", label: "Chain", icon: ListTree },
];

function fmtVec(v: [number, number, number]): string {
  return `(${v[0].toFixed(2)}, ${v[1].toFixed(2)}, ${v[2].toFixed(2)})`;
}

function fmtSignedDelta(n: number): string {
  const r = Math.abs(n) < 0.05 ? 0 : n;
  return `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}`;
}

function normalDirection(n: [number, number, number]): string {
  const axes: [string, number][] = [
    ["+X", n[0]],
    ["-X", -n[0]],
    ["+Y", n[1]],
    ["-Y", -n[1]],
    ["+Z", n[2]],
    ["-Z", -n[2]],
  ];
  axes.sort((a, b) => b[1] - a[1]);
  return axes[0][1] > 0.7 ? axes[0][0] : `~${axes[0][0]}`;
}

function kindLabel(kind: MeasureKind, id: string): string {
  return `${kind.charAt(0).toUpperCase() + kind.slice(1)} ${id}`;
}

function summarizeSingle(entity: MeasureEntity): { title: string; lines: string[] } {
  const title = kindLabel(entity.kind, entity.id);
  const lines: string[] = [];
  if (entity.kind === "face") {
    if (entity.area !== undefined) lines.push(`Area: ${entity.area.toLocaleString(undefined, { maximumFractionDigits: 3 })} mm²`);
    if (entity.perimeter !== undefined) lines.push(`Perimeter: ${entity.perimeter.toFixed(3)} mm`);
    if (entity.normal) lines.push(`Normal: ${normalDirection(entity.normal)}`);
    if (entity.center) lines.push(`Center: ${fmtVec(entity.center)}`);
    if (entity.radius !== undefined && entity.radius !== null) lines.push(`Radius: ${entity.radius.toFixed(3)} mm`);
  } else if (entity.kind === "edge") {
    if (entity.length !== undefined) lines.push(`Length: ${entity.length.toFixed(3)} mm`);
    if (entity.isArc && entity.radius !== undefined && entity.radius !== null) {
      lines.push(`Arc radius: ${entity.radius.toFixed(3)} mm`);
    }
    if (entity.endpoints) lines.push(`${fmtVec(entity.endpoints[0])} → ${fmtVec(entity.endpoints[1])}`);
  } else {
    if (entity.position) lines.push(`Position: ${fmtVec(entity.position)}`);
  }
  return { title, lines };
}

function summarizePair(pair: MeasurePair): { title: string; lines: string[] } {
  const title = `${pair.a.id} ↔ ${pair.b.id}`;
  const lines = [
    `Distance: ${pair.distance.toFixed(3)} mm`,
    `Δx ${fmtSignedDelta(pair.delta[0])}   Δy ${fmtSignedDelta(pair.delta[1])}   Δz ${fmtSignedDelta(pair.delta[2])}`,
  ];
  if (pair.angleDeg !== undefined) {
    lines.push(`Angle: ${pair.angleDeg.toFixed(2)}°${pair.parallel ? " (parallel)" : ""}`);
  }
  return { title, lines };
}

function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label="Copy measurement"
      className="shrink-0 rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-accent hover:text-foreground group-hover:opacity-100"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(getText());
          setCopied(true);
          window.setTimeout(() => setCopied(false), 900);
        } catch {
          /* clipboard blocked — silent */
        }
      }}
    >
      {copied ? <Check className="size-3 text-emerald-500" /> : <Copy className="size-3" />}
    </button>
  );
}

function ResultCard({ result, index }: { result: MeasureResult; index: number }) {
  const summary =
    result.kind === "single"
      ? summarizeSingle(result.entity)
      : summarizePair(result.pair);
  const text = `${summary.title}\n${summary.lines.join("\n")}`;
  return (
    <li className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/40">
      <span className="mt-0.5 shrink-0 text-[10px] font-mono text-muted-foreground tabular-nums">
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-medium">{summary.title}</div>
        <div className="mt-0.5 space-y-0.5">
          {summary.lines.map((l, i) => (
            <div
              key={i}
              className={cn(
                "truncate text-[11px] text-muted-foreground",
                /Δx|Δy|Δz/.test(l) && "font-mono tabular-nums",
              )}
            >
              {l}
            </div>
          ))}
        </div>
      </div>
      <CopyButton getText={() => text} />
    </li>
  );
}

export function MeasurePanel() {
  const active = useMeasureStore((s) => s.active);
  const mode = useMeasureStore((s) => s.mode);
  const setMode = useMeasureStore((s) => s.setMode);
  const picks = useMeasureStore((s) => s.picks);
  const results = useMeasureStore((s) => s.results);
  const status = useMeasureStore((s) => s.status);
  const error = useMeasureStore((s) => s.error);
  const undo = useMeasureStore((s) => s.undo);
  const clear = useMeasureStore((s) => s.clear);
  const addToContext = useMeasureStore((s) => s.addToContext);
  const [justAdded, setJustAdded] = useState(false);

  if (!active) return null;

  // Chain running total (sum of pair distances).
  const total = results
    .filter((r): r is Extract<MeasureResult, { kind: "pair" }> => r.kind === "pair")
    .reduce((sum, r) => sum + r.pair.distance, 0);

  const showCard = picks.length > 0 || results.length > 0 || status === "error";

  return (
    <div className="pointer-events-auto flex w-[19rem] max-w-[calc(100vw-1.5rem)] flex-col-reverse gap-1.5">
      {/* Mode tabs + actions (at the bottom, adjacent to toolbar) */}
      <div className="flex items-center gap-1 rounded-md border bg-background/85 p-0.5 shadow-sm backdrop-blur">
        {MODE_TABS.map((t) => {
          const Icon = t.icon;
          const isActive = mode === t.value;
          return (
            <button
              key={t.value}
              type="button"
              onClick={() => setMode(t.value)}
              className={cn(
                "flex h-7 flex-1 items-center justify-center gap-1 rounded text-[11px] font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              aria-pressed={isActive}
            >
              <Icon className="size-3.5" />
              {t.label}
            </button>
          );
        })}
        <div className="mx-0.5 h-5 w-px bg-border" />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={cn(
            "h-7 w-7",
            justAdded ? "text-emerald-500" : "text-muted-foreground",
          )}
          disabled={results.length === 0}
          aria-label="Add measurement to chat context"
          onClick={() => {
            addToContext();
            setJustAdded(true);
            window.setTimeout(() => setJustAdded(false), 1000);
          }}
        >
          {justAdded ? (
            <Check className="size-3.5" />
          ) : (
            <MessageSquarePlus className="size-3.5" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground"
          onClick={undo}
          disabled={picks.length === 0}
          aria-label="Undo last pick"
        >
          <Undo2 className="size-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 text-muted-foreground"
          onClick={clear}
          disabled={picks.length === 0 && results.length === 0}
          aria-label="Clear measurement"
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>

      {/* Results card (grows upward above the tabs) */}
      {showCard && (
        <div className="flex max-h-72 flex-col overflow-hidden rounded-md border bg-background/90 shadow-md backdrop-blur">
          {status === "pending" && (
            <div className="flex shrink-0 items-center gap-1.5 border-b px-2.5 py-1 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              Measuring…
            </div>
          )}
          {status === "error" && error && (
            <div className="flex shrink-0 items-start gap-1.5 border-b border-destructive/40 bg-destructive/10 px-2.5 py-1.5 text-[11px] text-destructive">
              <TriangleAlert className="mt-0.5 size-3 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <ul className="flex flex-col p-1">
              {results.length === 0 && status !== "error" ? (
                <li className="px-2 py-1.5 text-[11px] text-muted-foreground">
                  {picks.length === 0
                    ? "Pick a face / edge / vertex…"
                    : mode === "pair" && picks.length === 1
                      ? "Pick a second entity…"
                      : "Working…"}
                </li>
              ) : (
                results.map((r, i) => (
                  <ResultCard key={i} result={r} index={i} />
                ))
              )}
            </ul>
          </div>
          {mode === "chain" && results.length > 1 && (
            <div className="flex shrink-0 items-center justify-between border-t bg-muted/40 px-2.5 py-1.5 text-[11px] font-medium tabular-nums">
              <span className="text-muted-foreground">
                {results.length} segments
              </span>
              <span>
                Σ {total.toFixed(3)} mm
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
