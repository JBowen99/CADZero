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
import { extractMeta } from "~/lib/model-meta";
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
  const language = useModelStore((s) => s.language);
  const ops = useMemo(
    () => extractMeta(cadCode ?? "", language).ops,
    [cadCode, language],
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="absolute left-3 top-3 z-10 space-y-px drop-shadow">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className={cn(
          "flex items-center gap-1.5 rounded px-1.5 py-0.5 text-xs",
          collapsed
            ? "text-muted-foreground hover:text-foreground"
            : "text-primary",
        )}
      >
        <Layers className="size-3.5" />
        {!collapsed && <span className="font-medium">Feature Tree</span>}
      </button>
      {!collapsed && (
        <ol className="space-y-px">
          {ops.length === 0 ? (
            <li className="px-1.5 text-[11px] text-muted-foreground">
              No operations yet
            </li>
          ) : (
            ops.map((op) => (
              <TreeRow
                key={op.id}
                op={op}
                selected={selected === op.id}
                onSelect={setSelected}
              />
            ))
          )}
        </ol>
      )}
    </div>
  );
}

function TreeRow({
  op,
  selected,
  onSelect,
}: {
  op: OpNode;
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
