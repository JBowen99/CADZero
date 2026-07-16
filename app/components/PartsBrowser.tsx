import { useState } from "react";
import { FilePlus2, Folder, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { ScrollArea } from "~/components/ui/scroll-area";
import { cn } from "~/lib/utils";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { partUrl } from "~/lib/api";
import type { PartSummary } from "~/types";
interface PartsBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function PartsBrowser({ open, onOpenChange }: PartsBrowserProps) {
  const parts = useWorkspaceStore((s) => s.parts);
  const refresh = useWorkspaceStore((s) => s.refresh);
  const openPart = useDocumentsStore((s) => s.openPart);
  const newTab = useDocumentsStore((s) => s.newTab);
  const closeTab = useDocumentsStore((s) => s.closeTab);
  const openDocs = useDocumentsStore((s) => s.openDocs);
  const activePartId = useDocumentsStore((s) => s.activeId);
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleOpen = async (id: string) => {
    onOpenChange(false);
    await openPart(id);
  };

  const handleNew = () => {
    onOpenChange(false);
    newTab();
  };

  const handleDelete = async (part: PartSummary) => {
    if (
      !window.confirm(
        `Delete "${part.name}"? This removes the .cadz file permanently.`,
      )
    )
      return;
    setBusyId(part.id);
    const res = await fetch(partUrl(part.id), { method: "DELETE" });
    setBusyId(null);
    if (!res.ok) {
      toast.error("Couldn't delete part");
      return;
    }
    const tab = openDocs.find((d) => d.partId === part.id);
    if (tab) {
      closeTab(tab.clientId);
      if (useDocumentsStore.getState().openDocs.length === 0) newTab();
    }
    await refresh();
    toast.success(`Deleted "${part.name}"`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Folder className="size-4" />
            Parts
          </DialogTitle>
          <DialogDescription>
            Open a part, or start a new one. New parts are saved on the first
            build.
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-end">
          <Button size="sm" variant="outline" onClick={handleNew}>
            <FilePlus2 className="size-4" />
            New part
          </Button>
        </div>

        <ScrollArea className="max-h-72">
          {parts.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No parts yet. Start a new part and describe something to build.
            </div>
          ) : (
            <ul className="flex flex-col gap-1">
              {parts.map((part) => (
                <li
                  key={part.id}
                  className={cn(
                    "group flex items-center gap-2 rounded-md border px-2.5 py-2 transition-colors",
                    part.id === activePartId
                      ? "border-primary/40 bg-accent/40"
                      : "hover:bg-accent/40",
                  )}
                >
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => void handleOpen(part.id)}
                  >
                    <div className="truncate text-sm font-medium">
                      {part.name}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {part.headRevId ? "saved" : "empty"} ·{" "}
                      {timeAgo(part.updatedAt)}
                    </div>
                  </button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                    aria-label={`Delete ${part.name}`}
                    disabled={busyId === part.id}
                    onClick={() => void handleDelete(part)}
                  >
                    {busyId === part.id ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="size-3.5" />
                    )}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
