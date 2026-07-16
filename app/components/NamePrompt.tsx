import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
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
import { useDocumentsStore } from "~/store/useDocumentsStore";

export function NamePrompt() {
  const open = useDocumentsStore((s) => s.namePromptOpen);
  const resolveName = useDocumentsStore((s) => s.resolveName);
  const setOpen = useDocumentsStore((s) => s.setNamePromptOpen);
  const pendingName = useDocumentsStore(
    (s) =>
      s.openDocs.find((d) => d.clientId === s.activeClientId)?.pendingName ??
      null,
  );
  const activeName = useDocumentsStore((s) => s.activeMeta?.name ?? null);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(pendingName ?? (activeName && activeName !== "Untitled" ? activeName : ""));
      setBusy(false);
    }
  }, [open, pendingName, activeName]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await resolveName(trimmed);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const hint = /failed to fetch|network|load failed|fetch failed/i.test(
        msg,
      )
        ? "Can't reach the backend — is it running? (pnpm dev:server)"
        : msg;
      toast.error("Couldn't save", { description: hint });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Name this part</DialogTitle>
          <DialogDescription>
            Saved as a <code className="text-xs">.cadz</code> file in your
            workspace.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void submit();
            }}
            placeholder="Part name"
            className="text-sm"
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void submit()} disabled={busy || !value.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
