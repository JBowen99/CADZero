import { useState } from "react";
import { ChevronDown, Ruler, X } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { useMeasureStore } from "~/store/useMeasureStore";
import type { MeasureResult } from "~/types";

function fmtResult(r: MeasureResult): { title: string; detail: string } {
  if (r.kind === "single") {
    const e = r.entity;
    if (e.kind === "face") {
      return {
        title: `Face ${e.id}`,
        detail: `area ${e.area?.toFixed(2)} mm²${e.perimeter != null ? ` · perim ${e.perimeter.toFixed(2)} mm` : ""}`,
      };
    }
    if (e.kind === "edge") {
      const arc = e.isArc && e.radius != null ? ` · R ${e.radius.toFixed(2)}` : "";
      return { title: `Edge ${e.id}`, detail: `${e.length?.toFixed(2)} mm${arc}` };
    }
    return {
      title: `Vertex ${e.id}`,
      detail: `(${e.position?.map((n) => n.toFixed(1)).join(", ")})`,
    };
  }
  const p = r.pair;
  const angle = p.angleDeg != null ? `  ∠ ${p.angleDeg.toFixed(1)}°` : "";
  return {
    title: `${p.a.id} ↔ ${p.b.id}`,
    detail: `${p.distance.toFixed(2)} mm${angle}`,
  };
}

export interface MeasureContextIndicatorProps {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  sideOffset?: number;
  variant?: "overlay" | "plain";
  className?: string;
}

export function MeasureContextIndicator({
  align = "start",
  side = "top",
  sideOffset = 6,
  variant = "plain",
  className,
}: MeasureContextIndicatorProps) {
  const [open, setOpen] = useState(false);
  const results = useMeasureStore((s) => s.contextResults);
  const clear = useMeasureStore((s) => s.clearContext);
  const remove = useMeasureStore((s) => s.removeFromContext);
  const setHovered = useMeasureStore((s) => s.setHoveredContext);

  if (results.length === 0) return null;

  const count = results.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Measurements: ${count} ${count === 1 ? "item" : "items"}`}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-cyan-500/40 bg-cyan-500/10 px-2 py-1 text-[11px] font-medium text-cyan-600 transition-colors hover:bg-cyan-500/15 dark:text-cyan-400",
            variant === "overlay" && "bg-background/80 backdrop-blur",
            className,
          )}
        >
          <Ruler className="size-3.5" />
          <span>
            {count} measurement{count === 1 ? "" : "s"}
          </span>
          <ChevronDown className="size-3 opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="flex max-h-80 w-72 flex-col overflow-hidden p-0"
      >
        <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
          <Ruler className="size-4 text-cyan-500 dark:text-cyan-400" />
          <span className="text-sm font-medium">Measurements</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {count} {count === 1 ? "item" : "items"}
          </span>
          <button
            type="button"
            onClick={clear}
            className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            Clear all
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ul className="flex flex-col p-1.5">
            {results.map((r, i) => {
              const { title, detail } = fmtResult(r);
              return (
                <li
                  key={i}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                >
                  <Ruler className="mt-0.5 size-3.5 shrink-0 text-cyan-500 dark:text-cyan-400" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{title}</div>
                    <div className="truncate text-[11px] text-muted-foreground tabular-nums">
                      {detail}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    aria-label={`Remove ${title}`}
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                  >
                    <X className="size-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </PopoverContent>
    </Popover>
  );
}
