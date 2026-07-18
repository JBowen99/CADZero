import { useState } from "react";
import {
  ChevronDown,
  CircleDot,
  ListChecks,
  Slash,
  Square,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";
import { useSelectionStore } from "~/store/useSelectionStore";
import type { SelectionKind } from "~/types";

const KIND_ICON: Record<SelectionKind, LucideIcon> = {
  face: Square,
  edge: Slash,
  vertex: CircleDot,
};

export interface SelectionIndicatorProps {
  align?: "start" | "center" | "end";
  side?: "top" | "bottom";
  sideOffset?: number;
  /** Use the translucent viewport styling instead of the solid chat styling. */
  variant?: "overlay" | "plain";
  className?: string;
}

export function SelectionIndicator({
  align = "start",
  side = "top",
  sideOffset = 6,
  variant = "plain",
  className,
}: SelectionIndicatorProps) {
  const [open, setOpen] = useState(false);
  const selection = useSelectionStore((s) => s.selection);
  const remove = useSelectionStore((s) => s.remove);
  const clear = useSelectionStore((s) => s.clear);

  if (selection.length === 0) return null;

  const count = selection.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Selection: ${count} ${count === 1 ? "item" : "items"}`}
          className={cn(
            "flex items-center gap-1.5 rounded-md border border-primary/40 bg-primary/10 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/15",
            variant === "overlay" && "bg-background/80 backdrop-blur",
            className,
          )}
        >
          <ListChecks className="size-3.5" />
          <span>{count} selected</span>
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
          <ListChecks className="size-4 text-muted-foreground" />
          <span className="text-sm font-medium">Selection</span>
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
            {selection.map((s) => {
              const Icon = KIND_ICON[s.kind] ?? Square;
              return (
                <li
                  key={`${s.kind}-${s.id}`}
                  className="group flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{s.label}</div>
                    {s.summary && (
                      <div className="truncate text-[11px] text-muted-foreground">
                        {s.summary}
                      </div>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(s.kind, s.id)}
                    aria-label={`Remove ${s.label}`}
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
