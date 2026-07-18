import { useEffect, useState } from "react";
import { Box, Boxes, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import type { BackendName } from "~/types";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useSettingsStore } from "~/store/useSettingsStore";
import { useCapabilitiesStore } from "~/store/useCapabilitiesStore";

export function NewPartDialog() {
  const open = useDocumentsStore((s) => s.newPartDialogOpen);
  const setOpen = useDocumentsStore((s) => s.setNewPartDialogOpen);
  const newTab = useDocumentsStore((s) => s.newTab);
  const defaultBackend = useSettingsStore((s) => s.defaultBackend);
  const setDefaultBackend = useSettingsStore((s) => s.setDefaultBackend);
  const build123d = useCapabilitiesStore((s) => s.build123d);
  const capsLoaded = useCapabilitiesStore((s) => s.loaded);

  const [selected, setSelected] = useState<BackendName>("openscad");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setSelected(defaultBackend ?? "openscad");
      setBusy(false);
    }
  }, [open, defaultBackend]);

  const build123dDisabled = capsLoaded && !build123d.ok;

  const submit = async (language: BackendName) => {
    setBusy(true);
    try {
      setDefaultBackend(language);
      newTab(language);
      setOpen(false);
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
          <DialogTitle>New part</DialogTitle>
          <DialogDescription>
            Choose a modeling backend. This is locked once the part is created.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-1">
          <BackendTile
            icon={<Box className="size-5" />}
            label="OpenSCAD"
            blurb="CSG DSL. Fast, LLM-friendly."
            selected={selected === "openscad"}
            disabled={busy}
            onSelect={() => setSelected("openscad")}
          />
          <BackendTile
            icon={<Boxes className="size-5" />}
            label="Build123D"
            blurb="Python + OpenCascade. STEP, B-rep."
            selected={selected === "build123d"}
            disabled={busy || build123dDisabled}
            disabledHint={
              !capsLoaded
                ? "Checking runtime…"
                : build123d.error ??
                  "Build123D needs Python 3 with build123d installed (pip install build123d)"
            }
            onSelect={() => setSelected("build123d")}
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
          <Button
            onClick={() => void submit(selected)}
            disabled={busy || (selected === "build123d" && build123dDisabled)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackendTile({
  icon,
  label,
  blurb,
  selected,
  disabled,
  disabledHint,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  blurb: string;
  selected: boolean;
  disabled: boolean;
  disabledHint?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        "flex h-full w-full flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/10"
          : "border-border hover:bg-accent",
        disabled && "cursor-not-allowed opacity-50 hover:bg-transparent",
      )}
    >
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-[11px] leading-snug text-muted-foreground">
        {disabled && disabledHint ? disabledHint : blurb}
      </span>
    </button>
  );
}
