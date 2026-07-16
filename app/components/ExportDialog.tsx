import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { useModelStore } from "~/store/useModelStore";

export function ExportDialog() {
  const exportJob = useModelStore((s) => s.exportJob);
  const open = exportJob !== null;

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!open) return;
    const start = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - start) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="sm:max-w-sm"
      >
        <DialogHeader className="items-center text-center">
          <Loader2 className="size-8 animate-spin text-primary" />
          <DialogTitle>Exporting model…</DialogTitle>
          <DialogDescription>
            {exportJob
              ? `Rendering ${exportJob.filename} with OpenSCAD. This can take a few seconds for complex models.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        <p className="text-center text-xs tabular-nums text-muted-foreground">
          {elapsed}s elapsed
        </p>
      </DialogContent>
    </Dialog>
  );
}
