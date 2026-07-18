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

interface ProviderSetupProps {
  open?: boolean;
}

export function ProviderSetup({ open = true }: ProviderSetupProps) {
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
      toast.success("OpenRouter connected", {
        description: "You can change the key any time from Settings.",
      });
    } else {
      toast.error("Couldn't save the API key", {
        description: "The backend may not support storing keys in this mode.",
      });
    }
  };

  return (
    <Dialog open={open && !configured}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <KeyRound className="size-4" />
            Connect OpenRouter
          </DialogTitle>
          <DialogDescription>
            CADZero uses OpenRouter to power its AI assistant. Paste an API
            key to get started. Your key is stored encrypted with your OS
            keychain.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground">
            OpenRouter API key
          </label>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) void submit();
            }}
            placeholder="sk-or-v1-…"
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
        <DialogFooter>
          <Button
            onClick={() => void submit()}
            disabled={busy || !value.trim()}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Save key
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
