import { useState } from "react";
import { ChevronDown, Square } from "lucide-react";
import { SELECTION_KIND_ICON } from "~/components/SelectionIndicator";
import { cn } from "~/lib/utils";
import type { TopologySelection } from "~/types";

export function MessageSelectionContext({
  selection,
  className,
}: {
  selection: TopologySelection[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  if (selection.length === 0) return null;

  const count = selection.length;

  return (
    <div className={cn("flex w-full max-w-full flex-col items-end gap-1", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Selection context: ${count} selected`}
        className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[11px] font-medium text-primary transition-colors hover:bg-primary/10"
      >
        <span>
          {count} selected
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
          {selection.map((s) => {
            const Icon = SELECTION_KIND_ICON[s.kind] ?? Square;
            return (
              <li
                key={`${s.kind}-${s.id}`}
                className="flex items-start gap-2 px-2 py-1.5"
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
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
