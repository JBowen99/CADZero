import { useEffect, useState } from "react";
import { FileBox, FolderTree, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "~/components/ui/popover";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import type { PartType } from "~/types";

function basename(p: string | null): string {
  if (!p) return "Workspace";
  const clean = p.replace(/[\\/]+$/, "");
  const parts = clean.split(/[\\/]/);
  return parts[parts.length - 1] || "Workspace";
}

const TYPE_LABEL: Record<PartType, string> = {
  part: "Part",
  "sheet-metal": "Sheet metal",
  assembly: "Assembly",
};

export function WorkspaceTree() {
  const [open, setOpen] = useState(false);
  const parts = useWorkspaceStore((s) => s.parts);
  const root = useWorkspaceStore((s) => s.root);
  const refresh = useWorkspaceStore((s) => s.refresh);
  const openPart = useDocumentsStore((s) => s.openPart);
  const activeId = useDocumentsStore((s) => s.activeId);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (open) void refresh();
  }, [open, refresh]);

  const handleOpen = async (id: string) => {
    setOpen(false);
    setBusyId(id);
    try {
      await openPart(id);
    } finally {
      setBusyId(null);
    }
  };

  const label = basename(root);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="h-7 w-7 shrink-0"
          aria-label="Browse workspace"
        >
          <FolderTree className="size-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72 p-0"
      >
        <div className="flex items-center gap-2 border-b px-3 py-2">
          <FolderTree className="size-4 text-muted-foreground" />
          <span className="truncate text-sm font-medium">{label}</span>
          <span className="ml-auto text-[11px] text-muted-foreground">
            {parts.length} {parts.length === 1 ? "item" : "items"}
          </span>
        </div>

        <ScrollArea className="max-h-80">
          {parts.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              No parts in this workspace yet.
            </div>
          ) : (
            <ul className="flex flex-col p-1.5">
              {parts.map((part) => {
                const active = part.id === activeId;
                return (
                  <li key={part.id}>
                    <button
                      type="button"
                      onClick={() => void handleOpen(part.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        active
                          ? "bg-accent text-accent-foreground"
                          : "hover:bg-accent/50",
                      )}
                    >
                      {busyId === part.id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                      ) : (
                        <FileBox className="size-4 shrink-0 text-muted-foreground" />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {part.name}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {TYPE_LABEL[part.type]}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
