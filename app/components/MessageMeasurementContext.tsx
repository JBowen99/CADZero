import { useState } from "react";
import { ChevronDown, Ruler } from "lucide-react";
import { cn } from "~/lib/utils";
import type { MeasureResult } from "~/types";

function fmtResult(r: MeasureResult): string {
  if (r.kind === "single") {
    const e = r.entity;
    if (e.kind === "face") {
      return `${e.id} — area ${e.area?.toFixed(2)} mm²`;
    }
    if (e.kind === "edge") {
      const arc = e.isArc && e.radius != null ? ` (R ${e.radius.toFixed(2)})` : "";
      return `${e.id} — ${e.length?.toFixed(2)} mm${arc}`;
    }
    return `${e.id} — (${e.position?.map((n) => n.toFixed(1)).join(", ")})`;
  }
  const p = r.pair;
  const angle = p.angleDeg !== undefined ? `  ∠ ${p.angleDeg.toFixed(1)}°` : "";
  return `${p.a.id} ↔ ${p.b.id} — ${p.distance.toFixed(2)} mm${angle}`;
}

export function MessageMeasurementContext({
  measurements,
  className,
}: {
  measurements: MeasureResult[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (measurements.length === 0) return null;

  const count = measurements.length;

  return (
    <div className={cn("flex w-full max-w-full flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Measurement context: ${count} measurement${count === 1 ? "" : "s"}`}
        className="flex items-center gap-1 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-600 transition-colors hover:bg-cyan-500/15 dark:text-cyan-400"
      >
        <Ruler className="size-3 shrink-0" />
        <span>
          {count} measurement{count === 1 ? "" : "s"}
        </span>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 opacity-70 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open && (
        <ul className="flex w-full max-w-xs flex-col rounded-md border bg-muted/60 p-1.5">
          {measurements.map((m, i) => (
            <li
              key={i}
              className="flex items-center gap-2 px-2 py-1.5"
            >
              <Ruler className="size-3 shrink-0 text-cyan-500 dark:text-cyan-400" />
              <span className="min-w-0 flex-1 truncate text-[11px] tabular-nums">
                {fmtResult(m)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
