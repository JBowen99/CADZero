import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { useDocumentsStore } from "~/store/useDocumentsStore";

export function CodeDirtyGuardDialog() {
  const open = useDocumentsStore((s) => s.codeDirtyGuard?.open ?? false);
  const resolve = useDocumentsStore((s) => s.resolveCodeDirtyGuard);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) void resolve("cancel");
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Unsaved code edits</DialogTitle>
          <DialogDescription>
            You have manual edits in the code tab that will be replaced by this
            action. Save them first, discard them, or cancel.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => void resolve("cancel")}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => void resolve("discard")}>
            Discard
          </Button>
          <Button onClick={() => void resolve("save")}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
