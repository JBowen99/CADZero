import { Activity, Loader2 } from "lucide-react";
import type { ConnectionStatus } from "~/types";
import { useChatStore } from "~/store/useChatStore";
import { useConnectionStore } from "~/store/useConnectionStore";
import { useModelStore } from "~/store/useModelStore";
import { cn } from "~/lib/utils";

const statusColor: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-zinc-400",
};

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const backend = useModelStore((s) => s.backend);
  const isGenerating = useChatStore((s) => s.isGenerating);
  const lastError = useChatStore((s) => s.lastError);
  const mesh = useModelStore((s) => s.mesh);
  const lastActionAt = useChatStore((s) => s.lastActionAt);

  return (
    <footer className="flex h-7 items-center gap-4 border-t bg-background px-3 text-[11px] text-muted-foreground">
      <span className="flex items-center gap-1.5">
        <span
          className={cn("size-2 rounded-full", statusColor[status])}
          aria-hidden
        />
        <span className="capitalize">{status}</span>
      </span>

      <span className="flex items-center gap-1.5">
        <Activity className="size-3" />
        Backend:
        <span className="font-medium uppercase text-foreground">{backend}</span>
      </span>

      {mesh && (
        <span className="hidden sm:inline">
          Model:{" "}
          <span className="font-medium text-foreground">
            {mesh.kind}
            {mesh.size ? ` ${mesh.size.join("×")}` : ""}
          </span>
        </span>
      )}

      {lastError && (
        <span className="text-destructive">{lastError}</span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {isGenerating && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Generating…
          </span>
        )}
        {lastActionAt && !isGenerating && (
          <span>
            Last action {new Date(lastActionAt).toLocaleTimeString()}
          </span>
        )}
      </span>
    </footer>
  );
}
