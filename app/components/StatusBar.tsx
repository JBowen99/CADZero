import { Activity, Loader2 } from "lucide-react";
import type { ConnectionStatus } from "~/types";
import { isChatBusy, useChatContext } from "~/lib/ai-chat";
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
  const chatStatus = useChatContext().status;
  const busy = isChatBusy(chatStatus);
  const mesh = useModelStore((s) => s.mesh);

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

      <span className="ml-auto flex items-center gap-2">
        {busy && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Responding…
          </span>
        )}
        {chatStatus === "error" && (
          <span className="text-destructive">Chat error</span>
        )}
      </span>
    </footer>
  );
}
