import { useEffect, useState } from "react";
import { ExternalLink, KeyRound, Loader2 } from "lucide-react";
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
import { useProvidersStore } from "~/store/useProvidersStore";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const setKey = useProvidersStore((s) => s.setKey);
  const configured = useProvidersStore(
    (s) => Boolean(s.providers.openrouter?.configured),
  );
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setValue("");
      setBusy(false);
    }
  }, [open]);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    const ok = await setKey("openrouter", trimmed);
    setBusy(false);
    if (ok) {
      toast.success("API key saved");
      onOpenChange(false);
    } else {
      toast.error("Couldn't save the API key", {
        description: "The backend may not support storing keys in this mode.",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            Configure AI providers. Keys are stored encrypted with your OS
            keychain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <KeyRound className="size-3" />
                OpenRouter API key
              </label>
              {configured ? (
                <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                  Configured
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">
                  Not set
                </span>
              )}
            </div>
            <Input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !busy) void submit();
              }}
              placeholder={configured ? "Enter a new key to replace it" : "sk-or-v1-…"}
              type="password"
              className="font-mono text-sm"
              autoFocus
            />
            <a
              href="https://openrouter.ai/keys"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Get a key at openrouter.ai/keys
              <ExternalLink className="size-3" />
            </a>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
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
