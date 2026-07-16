import { Minus, Square, X, Copy } from "lucide-react";
import { useElectronWindow } from "~/lib/useElectronWindow";

export function WindowControls() {
  const { isElectron, maximized, minimize, toggleMaximize, close } =
    useElectronWindow();

  if (!isElectron) return null;

  return (
    <div className="no-drag flex items-center">
      <button
        type="button"
        onClick={minimize}
        aria-label="Minimize"
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
      >
        <Minus className="size-4" />
      </button>
      <button
        type="button"
        onClick={toggleMaximize}
        aria-label={maximized ? "Restore" : "Maximize"}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
      >
        {maximized ? <Copy className="size-3.5" /> : <Square className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={close}
        aria-label="Close"
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
