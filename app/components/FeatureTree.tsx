import { useMemo, useState } from "react";
import {
  Box,
  CircleDot,
  Disc,
  Flag,
  Grid3x3,
  Layers,
  Minus,
  PenTool,
  RotateCw,
  Spline,
  Triangle,
  type LucideIcon,
} from "lucide-react";
import type { OpKind, OpNode } from "~/types";
import { extractScadMeta } from "~/lib/scad-meta";
import { useModelStore } from "~/store/useModelStore";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";

const OP_ICONS: Record<OpKind, LucideIcon> = {
  sketch: PenTool,
  extrude: Box,
  cut: Minus,
  revolve: RotateCw,
  fillet: Spline,
  chamfer: Triangle,
  pattern: Grid3x3,
  shell: Layers,
  hole: Disc,
  offset: Layers,
  hull: Layers,
  union: Layers,
  intersection: Layers,
  mirror: Layers,
  rotate: RotateCw,
  translate: Box,
  scale: Box,
  final: Flag,
  other: CircleDot,
};

export function FeatureTree() {
  const cadCode = useModelStore((s) => s.cadCode);
  const meta = useMemo(
    () => extractScadMeta(cadCode ?? ""),
    [cadCode],
  );
  const ops = meta.ops;
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-r bg-background">
      <div className="flex h-11 shrink-0 items-center gap-1.5 px-3">
        <Layers className="size-3.5 text-primary" />
        <span className="text-xs font-semibold">Feature Tree</span>
      </div>
      <div className="min-h-0 flex-1">
        {ops.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
            <p className="text-xs text-muted-foreground">
              No operations found
            </p>
            <p className="text-[11px] text-muted-foreground">
              Operations appear here when the model uses{" "}
              <code className="rounded bg-muted px-1 py-0.5">
                @op
              </code>{" "}
              markers.
            </p>
          </div>
        ) : (
          <ScrollArea className="h-full">
            <ol className="relative space-y-0.5 p-2">
              {ops.map((op, i) => (
                <TreeRow
                  key={op.id}
                  op={op}
                  isLast={i === ops.length - 1}
                  selected={selected === op.id}
                  onSelect={setSelected}
                />
              ))}
            </ol>
          </ScrollArea>
        )}
      </div>
    </aside>
  );
}

function TreeRow({
  op,
  isLast,
  selected,
  onSelect,
}: {
  op: OpNode;
  isLast: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const Icon = OP_ICONS[op.kind] ?? CircleDot;
  return (
    <li className="relative pl-5">
      {!isLast && (
        <span className="absolute top-5 left-[9px] h-full w-px bg-border" />
      )}
      <span className="absolute top-1.5 left-0 size-[18px] rounded-full border-2 border-border bg-background" />
      <button
        type="button"
        onClick={() => onSelect(op.id)}
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors",
          selected
            ? "bg-primary/10 text-primary"
            : "text-foreground hover:bg-accent",
        )}
      >
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate">{op.name}</span>
        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">
          {op.rawKind}
        </span>
      </button>
    </li>
  );
}
