import { useCallback, useRef, useState } from "react";
import { Code2, Loader2, Play, Redo2, Undo2, X } from "lucide-react";
import { CodeEditor, type CodeEditorHandle } from "~/components/CodeEditor";
import { Button } from "~/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "~/components/ui/tooltip";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useModelStore } from "~/store/useModelStore";

export function CodeView() {
  const cadCode = useModelStore((s) => s.cadCode);
  const language = useModelStore((s) => s.language);
  const triangleCount = useModelStore((s) => s.mesh?.triangleCount ?? null);
  const rendering = useModelStore((s) => s.isRendering);
  const clientId = useDocumentsStore((s) => s.activeClientId);
  const editActiveCode = useDocumentsStore((s) => s.editActiveCode);
  const renderActiveCode = useDocumentsStore((s) => s.renderActiveCode);
  const editorRef = useRef<CodeEditorHandle>(null);

  const [error, setError] = useState<string | null>(null);

  const canRender = true;

  const handleRender = useCallback(async () => {
    setError(null);
    const result = await renderActiveCode();
    if (!result.ok) {
      const msg = result.stderr?.trim() || result.message || "Render failed.";
      setError(msg);
    }
  }, [renderActiveCode]);

  if (!cadCode) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted">
          <Code2 className="size-5 text-muted-foreground" />
        </span>
        <div className="space-y-1">
          <h3 className="text-sm font-medium">No code yet</h3>
          <p className="text-xs text-muted-foreground">
            Build a model in chat to see its {language} source here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{language} source</span>
        <div className="flex items-center gap-2">
          {triangleCount != null && (
            <span className="normal-case tracking-normal">
              {triangleCount.toLocaleString()} triangles
            </span>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => editorRef.current?.undo()}
                aria-label="Undo"
              >
                <Undo2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Undo (⌘/Ctrl+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => editorRef.current?.redo()}
                aria-label="Redo"
              >
                <Redo2 className="size-3" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Redo (⌘/Ctrl+Shift+Z)</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => void handleRender()}
                disabled={rendering || !canRender}
                aria-label="Render model"
              >
                {rendering ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Play className="size-3" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Render (⌘/Ctrl+Enter)</TooltipContent>
          </Tooltip>
        </div>
      </div>
      {error && (
        <div className="mx-3 mb-1 shrink-0 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <div className="flex items-start justify-between gap-2">
            <pre className="whitespace-pre-wrap break-words font-mono leading-relaxed">
              {error}
            </pre>
            <button
              type="button"
              className="shrink-0 text-destructive/70 hover:text-destructive"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X className="size-3" />
            </button>
          </div>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeEditor
          key={clientId}
          ref={editorRef}
          value={cadCode}
          language={language}
          onChange={editActiveCode}
          onRender={() => void handleRender()}
        />
      </div>
    </div>
  );
}
