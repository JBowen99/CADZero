import { History, Loader2, Plus, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { isChatBusy, useChatStatus } from "~/lib/ai-chat";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useModelStore } from "~/store/useModelStore";
import { WorkspaceTree } from "~/components/WorkspaceTree";

export function TabBar() {
  const openDocs = useDocumentsStore((s) => s.openDocs);
  const activeClientId = useDocumentsStore((s) => s.activeClientId);
  const setActive = useDocumentsStore((s) => s.setActive);
  const closeTab = useDocumentsStore((s) => s.closeTab);
  const newTab = useDocumentsStore((s) => s.newTab);
  const chatStatus = useChatStatus();
  const busy = isChatBusy(chatStatus);
  const isBuilding = useModelStore((s) => s.isBuilding);
  const blocked = busy || isBuilding;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1 overflow-x-auto border-b bg-background px-2">
      <WorkspaceTree />
      <div className="mr-1 h-5 w-px shrink-0 bg-border" />
      {openDocs.map((doc) => {
        const active = doc.clientId === activeClientId;
        const label =
          doc.meta?.name ?? doc.pendingName ?? (doc.partId ? "Part" : "New part");
        return (
          <div
            key={doc.clientId}
            className={cn(
              "group flex h-7 shrink-0 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
              active
                ? "border-primary/40 bg-accent text-accent-foreground"
                : "border-transparent text-muted-foreground hover:bg-accent/50 hover:text-foreground",
            )}
          >
            <button
              type="button"
              className="flex min-w-0 items-center gap-1"
              disabled={blocked && !active}
              onClick={() => !active && setActive(doc.clientId)}
              title={label}
            >
              {doc.saveState === "saving" ? (
                <Loader2 className="size-3 shrink-0 animate-spin" />
              ) : doc.saveState === "unsaved" ? (
                <span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
              ) : null}
              <span className="max-w-[150px] truncate">{label}</span>
              {doc.previewingRevId && (
                <History className="size-3 shrink-0 text-amber-500" />
              )}
            </button>
            <button
              type="button"
              className="flex size-4 items-center justify-center rounded-sm text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover:opacity-100"
              disabled={blocked && active}
              onClick={() => closeTab(doc.clientId)}
              aria-label={`Close ${label}`}
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="h-7 w-7 shrink-0"
        onClick={() => newTab()}
        aria-label="New tab"
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
