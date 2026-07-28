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
  const ops = useMemo(() => extractScadMeta(cadCode ?? "").ops, [cadCode]);
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="absolute left-3 top-3 z-10 text-muted-foreground drop-shadow hover:text-foreground"
      >
        <Layers className="size-4" />
      </button>
    );
  }

  return (
    <ol className="absolute left-3 top-3 z-10 space-y-px drop-shadow">
      {ops.length === 0 ? (
        <li className="text-[11px] text-muted-foreground drop-shadow">
          No operations yet
        </li>
      ) : (
        ops.map((op, i) => (
          <TreeRow
            key={op.id}
            op={op}
            isLast={i === ops.length - 1}
            selected={selected === op.id}
            onSelect={(id) => {
              setSelected(id);
              if (id === selected) setCollapsed(true);
            }}
          />
        ))
      )}
      <li>
        <button
          type="button"
          onClick={() => setCollapsed(true)}
          className="text-muted-foreground/60 hover:text-foreground"
        >
          <Minus className="size-3" />
        </button>
      </li>
    </ol>
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
    <li className="relative flex items-center">
      <button
        type="button"
        onClick={() => onSelect(op.id)}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs",
          selected
            ? "bg-primary/20 text-primary"
            : "text-foreground/90 hover:bg-accent/40",
        )}
      >
        <Icon className="size-3 shrink-0" />
        <span>{op.name}</span>
      </button>
    </li>
  );
}
