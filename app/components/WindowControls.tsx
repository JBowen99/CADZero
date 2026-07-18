import type { CSSProperties, MouseEvent } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { useElectronWindow } from "~/lib/useElectronWindow";

const noDragStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

export function WindowControls() {
  const { isElectron, maximized, minimize, toggleMaximize, close } =
    useElectronWindow();

  if (!isElectron) return null;

  // Use mousedown: drag regions on the title bar often swallow the click sequence.
  const onMinimize = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    minimize();
  };
  const onToggleMaximize = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleMaximize();
  };
  const onClose = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    close();
  };

  return (
    <div className="flex items-center" style={noDragStyle} data-no-drag>
      <button
        type="button"
        onMouseDown={onMinimize}
        aria-label="Minimize"
        style={noDragStyle}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
      >
        <Minus className="pointer-events-none size-4" />
      </button>
      <button
        type="button"
        onMouseDown={onToggleMaximize}
        aria-label={maximized ? "Restore" : "Maximize"}
        style={noDragStyle}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-accent"
      >
        {maximized ? (
          <Copy className="pointer-events-none size-3.5" />
        ) : (
          <Square className="pointer-events-none size-3.5" />
        )}
      </button>
      <button
        type="button"
        onMouseDown={onClose}
        aria-label="Close"
        style={noDragStyle}
        className="flex size-8 items-center justify-center text-muted-foreground transition-colors hover:bg-destructive hover:text-white"
      >
        <X className="pointer-events-none size-4" />
      </button>
    </div>
  );
}
