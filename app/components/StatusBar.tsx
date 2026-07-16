import { Activity, AlertTriangle, Box, CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { ConnectionStatus } from "~/types";
import { isChatBusy, useChatStatus } from "~/lib/ai-chat";
import { useConnectionStore } from "~/store/useConnectionStore";
import { useModelStore } from "~/store/useModelStore";
import { capabilitiesUrl } from "~/lib/api";
import { cn } from "~/lib/utils";

const statusColor: Record<ConnectionStatus, string> = {
  connected: "bg-emerald-500",
  connecting: "bg-amber-500 animate-pulse",
  disconnected: "bg-zinc-400",
};

type Capability =
  | { state: "loading" }
  | { state: "ok"; version: string }
  | { state: "missing"; error: string };

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const backend = useModelStore((s) => s.backend);
  const chatStatus = useChatStatus();
  const busy = isChatBusy(chatStatus);
  const mesh = useModelStore((s) => s.mesh);
  const isBuilding = useModelStore((s) => s.isBuilding);

  const [cap, setCap] = useState<Capability>({ state: "loading" });
  useEffect(() => {
    let cancelled = false;
    void fetch(capabilitiesUrl)
      .then((r) => r.json())
      .then((data: { openscad?: { ok?: boolean; version?: string; error?: string } }) => {
        if (cancelled) return;
        const o = data.openscad;
        if (o?.ok) setCap({ state: "ok", version: (o.version ?? "").trim() });
        else setCap({ state: "missing", error: o?.error ?? "not found" });
      })
      .catch(() => {
        if (!cancelled) setCap({ state: "missing", error: "backend unreachable" });
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <span className="flex items-center gap-1.5">
        {cap.state === "loading" && <Loader2 className="size-3 animate-spin" />}
        {cap.state === "ok" && (
          <CheckCircle2 className="size-3 text-emerald-500" />
        )}
        {cap.state === "missing" && (
          <AlertTriangle className="size-3 text-amber-500" />
        )}
        <span>
          OpenSCAD:{" "}
          <span
            className={cn(
              "font-medium",
              cap.state === "ok"
                ? "text-foreground"
                : cap.state === "missing" && "text-amber-600 dark:text-amber-400",
            )}
          >
            {cap.state === "loading" && "checking…"}
            {cap.state === "ok" && "ready"}
            {cap.state === "missing" && "not found"}
          </span>
        </span>
      </span>

      {mesh && (
        <span className="hidden items-center gap-1.5 sm:inline-flex">
          <Box className="size-3" />
          Model:{" "}
          <span className="font-medium text-foreground">
            {mesh.triangleCount.toLocaleString()} triangles
          </span>
        </span>
      )}

      <span className="ml-auto flex items-center gap-2">
        {isBuilding && (
          <span className="flex items-center gap-1.5">
            <Loader2 className="size-3 animate-spin" />
            Rendering model…
          </span>
        )}
        {busy && !isBuilding && (
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
