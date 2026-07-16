import { useState } from "react";
import { FolderOpen, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useWorkspaceStore } from "~/store/useWorkspaceStore";

const DEFAULT_HINT = "~/.cadzero/workspace";

interface WorkspaceSetupProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  dismissible?: boolean;
  currentRoot?: string | null;
}

export function WorkspaceSetup({
  open = true,
  onOpenChange,
  dismissible = false,
  currentRoot,
}: WorkspaceSetupProps) {
  const setRoot = useWorkspaceStore((s) => s.setRoot);
  const [value, setValue] = useState(
    currentRoot && currentRoot.length > 0 ? currentRoot : DEFAULT_HINT,
  );
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    const resolved = await setRoot(trimmed);
    setBusy(false);
    if (resolved) {
      toast.success("Workspace ready", { description: resolved });
      onOpenChange?.(false);
    } else {
      toast.error("Couldn't set workspace", {
        description: "Check the path is valid and writable.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={dismissible ? onOpenChange : undefined}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (!dismissible) e.preventDefault();
        }}
        showCloseButton={dismissible}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="size-4" />
            Choose a workspace
          </DialogTitle>
          <DialogDescription>
            Parts are saved as <code className="text-xs">.cadz</code> files in
            this folder. You can change it later.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">Folder path</label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void submit();
            }}
            placeholder={DEFAULT_HINT}
            className="font-mono text-sm"
            autoFocus
          />
          <p className="text-[11px] text-muted-foreground">
            Native folder picker coming with the desktop build — for now, type
            or paste a path.
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Use this folder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
