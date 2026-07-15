import { Code2 } from "lucide-react";
import { CodeBlock } from "~/components/CodeBlock";
import { useModelStore } from "~/store/useModelStore";

export function CodeView() {
  const cadCode = useModelStore((s) => s.cadCode);
  const language = useModelStore((s) => s.language);
  const triangleCount = useModelStore((s) => s.mesh?.triangleCount ?? null);

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
      <div className="flex shrink-0 items-center justify-between border-b px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>{language} source</span>
        {triangleCount != null && (
          <span className="normal-case tracking-normal">
            {triangleCount.toLocaleString()} triangles
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <CodeBlock
          code={cadCode}
          language={language}
          className="m-3 rounded-md"
        />
      </div>
    </div>
  );
}
