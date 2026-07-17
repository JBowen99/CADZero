import { memo } from "react";
import { AlertCircle, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import type { UIMessage } from "ai";
import { CodeBlock } from "~/components/CodeBlock";
import { cn } from "~/lib/utils";

interface BuildPart {
  type: `tool-${string}`;
  state?: string;
  input?: { code?: string; language?: string; message?: string };
  output?: {
    success?: boolean;
    message?: string;
    stderr?: string;
    meshId?: string;
    triangleCount?: number;
  };
}

interface ImagePart {
  type: "file";
  mediaType: string;
  url: string;
  filename?: string;
}

function BuildCard({ part }: { part: BuildPart }) {
  const state = part.state;
  const done = state === "output-available" || state === "output-error";
  const out = part.output;
  const failed = done && out?.success === false;
  const code = part.input?.code ?? "";

  return (
    <div className="flex w-full flex-col gap-2">
      {part.input?.message && (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
          {part.input.message}
        </p>
      )}
      {code && <CodeBlock code={code} language={part.input?.language ?? "openscad"} />}
      <div
        className={cn(
          "flex items-center gap-1.5 px-1 text-xs",
          failed ? "text-destructive" : "text-muted-foreground",
        )}
      >
        {!done && <Loader2 className="size-3.5 animate-spin" />}
        {done && !failed && (
          <CheckCircle2 className="size-3.5 text-emerald-500" />
        )}
        {failed && <AlertCircle className="size-3.5" />}
        <span>
          {!done && "Rendering model…"}
          {done && !failed &&
            `Rendered${out?.triangleCount ? ` · ${out.triangleCount.toLocaleString()} triangles` : ""}`}
          {failed && "OpenSCAD failed to render"}
        </span>
      </div>
      {failed && out?.stderr && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive/90">
          {out.stderr}
        </pre>
      )}
    </div>
  );
}

interface ChatMessageProps {
  message: UIMessage;
}

function ChatMessageBase({ message }: ChatMessageProps) {
  const isUser = message.role === "user";
  const isRestoreEvent =
    (message as { kind?: string }).kind === "restore";
  const parts = message.parts as unknown as Array<
    | { type: "text"; text: string }
    | BuildPart
    | ImagePart
  >;
  const text = parts
    .filter((p): p is { type: "text"; text: string } => p.type === "text")
    .map((p) => p.text)
    .join("");

  if (isRestoreEvent) {
    return (
      <div className="flex w-full justify-center px-4 py-1.5">
        <div className="flex max-w-[85%] items-center gap-1.5 rounded-lg border bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
          <RotateCcw className="size-3 shrink-0" />
          <span className="break-words">{text}</span>
        </div>
      </div>
    );
  }

  const buildParts = parts.filter(
    (p): p is BuildPart => p.type === "tool-update_model",
  );
  const imageParts = parts.filter(
    (p): p is ImagePart =>
      p.type === "file" && p.mediaType?.startsWith("image/"),
  );

  return (
    <div
      className={cn(
        "flex w-full px-4 py-3",
        isUser && "flex-row-reverse",
      )}
    >
      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-2",
          isUser && "items-end",
        )}
      >
        {text && (
          <div
            className={cn(
              "whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
              isUser
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-foreground",
            )}
          >
            {text}
          </div>
        )}
        {imageParts.length > 0 && (
          <div
            className={cn(
              "flex max-w-[85%] flex-wrap gap-2",
              isUser && "justify-end",
            )}
          >
            {imageParts.map((img, i) => (
              <img
                key={i}
                src={img.url}
                alt={img.filename ?? "attached image"}
                className="max-h-52 max-w-[220px] rounded-lg border object-contain"
              />
            ))}
          </div>
        )}
        {buildParts.map((part, i) => (
          <BuildCard key={i} part={part} />
        ))}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageBase);
