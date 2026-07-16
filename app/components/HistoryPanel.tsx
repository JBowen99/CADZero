import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Bookmark,
  Flag,
  History,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useRestoreWithNote } from "~/lib/useRestoreWithNote";
import { revisionsUrl } from "~/lib/api";
import type { RevisionDTO } from "~/types";

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

function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {icon}
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
    </div>
  );
}

export function HistoryPanel() {
  const activeId = useDocumentsStore((s) => s.activeId);
  const activeMeta = useDocumentsStore((s) => s.activeMeta);
  const headRevId = activeMeta?.headRevId ?? null;
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const previewRevision = useDocumentsStore((s) => s.previewRevision);
  const exitPreview = useDocumentsStore((s) => s.exitPreview);
  const restoreWithNote = useRestoreWithNote();
  const checkpoint = useDocumentsStore((s) => s.checkpoint);

  const [revs, setRevs] = useState<RevisionDTO[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeId) {
      setRevs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetch(revisionsUrl(activeId))
      .then((r) => (r.ok ? r.json() : Promise.resolve([])))
      .then((list: RevisionDTO[]) => {
        if (cancelled) return;
        setRevs(list);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) {
          setRevs([]);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [activeId, activeMeta?.updatedAt]);

  const handleCheckpoint = async () => {
    const label = window.prompt("Checkpoint name (labels the current version):")?.trim();
    if (!label) return;
    await checkpoint(label);
    toast.success(`Checkpointed “${label}”`);
  };

  const handleRestore = async (revId: string) => {
    if (
      !window.confirm(
        "Continue from this version? A new branch is created at the current point — later work is kept in history.",
      )
    )
      return;
    await restoreWithNote(revId);
    toast.success("Restored — continuing from this version");
  };

  if (!activeId) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title="No part open"
        hint="Open or create a part to see its revision history."
      />
    );
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
        Loading history…
      </div>
    );
  }

  if (revs.length === 0) {
    return (
      <EmptyState
        icon={<History className="size-5" />}
        title="No revisions yet"
        hint="Build the model in chat — each build records a version here."
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-2">
        {previewingRevId ? (
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => void exitPreview()}
          >
            <ArrowLeft className="size-3.5" />
            Back to current
          </Button>
        ) : (
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {revs.length} {revs.length === 1 ? "revision" : "revisions"}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7"
          onClick={() => void handleCheckpoint()}
          disabled={!headRevId}
        >
          <Bookmark className="size-3.5" />
          Checkpoint
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
        <ol className="flex min-w-0 flex-col py-1">
          {revs.map((rev, index) => {
            const version = revs.length - index;
            const isHead = rev.revId === headRevId;
            const isPreviewing = rev.revId === previewingRevId;
            return (
              <li
                key={rev.revId}
                className="group relative mx-2 my-0.5 rounded-md border px-2.5 py-2 transition-colors"
              >
                <button
                  type="button"
                  className="flex w-full items-start gap-2 text-left"
                  onClick={() =>
                    void (isHead ? exitPreview() : previewRevision(rev.revId))
                  }
                >
                  <span className="mt-px shrink-0 text-[10px] font-semibold tabular-nums text-muted-foreground">
                    v{version}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={cn(
                          "truncate text-xs font-medium",
                          isPreviewing && "text-primary",
                        )}
                      >
                        {rev.label ?? rev.message ?? `${rev.source} revision`}
                      </span>
                      {isHead && (
                        <Badge
                          variant="secondary"
                          className="h-4 shrink-0 px-1 text-[9px]"
                        >
                          current
                        </Badge>
                      )}
                      {rev.label && (
                        <Badge
                          variant="outline"
                          className="h-4 shrink-0 gap-0.5 px-1 text-[9px]"
                        >
                          <Flag className="size-2.5" />
                          {rev.label}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 text-[10px] capitalize text-muted-foreground">
                      {rev.source} · {timeAgo(rev.createdAt)}
                    </div>
                  </div>
                </button>
                {!isHead && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-1.5 top-1.5 h-6 gap-1 px-1.5 text-[10px] opacity-0 transition-opacity group-hover:opacity-100"
                    onClick={() => void handleRestore(rev.revId)}
                  >
                    <RotateCcw className="size-3" />
                    Restore
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {previewingRevId && (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t bg-accent/30 px-3 py-2">
          <span className="text-[11px] text-muted-foreground">
            Viewing an older version
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => void exitPreview()}
            >
              <ArrowLeft className="size-3.5" />
              Current
            </Button>
            <Button
              variant="default"
              size="sm"
              className="h-7"
              onClick={() => void handleRestore(previewingRevId)}
            >
              <RotateCcw className="size-3.5" />
              Restore
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
