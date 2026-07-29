import { memo, startTransition, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  RotateCcw,
} from "lucide-react";
import type { UIMessage } from "ai";
import { AssistantStatusMessage } from "~/components/AssistantStatusMessage";
import { Button } from "~/components/ui/button";
import { MessageSelectionContext } from "~/components/MessageSelectionContext";
import { MessageMeasurementContext } from "~/components/MessageMeasurementContext";
import { lineDiff } from "~/lib/diff";
import { cn } from "~/lib/utils";
import type { ChatMessageMetadata } from "~/types";

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

function BuildCard({
  part,
  previousCode,
}: {
  part: BuildPart;
  previousCode?: string;
}) {
  const state = part.state;
  const streamingInput = state === "input-streaming";
  const done = state === "output-available" || state === "output-error";
  const out = part.output;
  const failed = done && out?.success === false;
  const code = part.input?.code ?? "";
  const showCode = !!code && !streamingInput;
  const language = part.input?.language ?? "openscad";

  const [open, setOpen] = useState(false);
  const [codeReady, setCodeReady] = useState(false);
  const [copied, setCopied] = useState(false);

  const lineCount = useMemo(
    () => (code ? code.split("\n").length : 0),
    [code],
  );
  const diff = useMemo(
    () => (previousCode != null && code ? lineDiff(previousCode, code) : null),
    [previousCode, code],
  );

  // Defer mounting the <pre> until expanded so streaming status paints first.
  useEffect(() => {
    if (!showCode || !open) {
      setCodeReady(false);
      return;
    }
    let cancelled = false;
    const id = requestAnimationFrame(() => {
      startTransition(() => {
        if (!cancelled) setCodeReady(true);
      });
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [showCode, open, code]);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <div className="flex w-full flex-col gap-2">
      {part.input?.message && (
        <p className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm">
          {part.input.message}
        </p>
      )}
      {streamingInput && (
        <AssistantStatusMessage>Generating code…</AssistantStatusMessage>
      )}
      {showCode && (
        <div className="overflow-hidden rounded-md border bg-muted/40">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="flex w-full items-center gap-1.5 border-b bg-muted/60 px-2.5 py-1.5 text-left transition-colors hover:bg-muted"
          >
            <ChevronRight
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                open && "rotate-90",
              )}
            />
            <span className="font-mono text-[11px] uppercase tracking-wide text-muted-foreground">
              {language}
            </span>
            {diff ? (
              <span className="font-mono text-[11px] tabular-nums">
                <span className="text-emerald-600 dark:text-emerald-400">
                  +{diff.added}
                </span>
                {" "}
                <span className="text-destructive">−{diff.removed}</span>
              </span>
            ) : (
              lineCount > 0 && (
                <span className="font-mono text-[11px] text-muted-foreground">
                  {lineCount} {lineCount === 1 ? "line" : "lines"}
                </span>
              )
            )}
            <span className="ml-auto" />
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={copy}
              aria-label="Copy code"
            >
              {copied ? (
                <Check className="text-emerald-500" />
              ) : (
                <Copy className="text-muted-foreground" />
              )}
            </Button>
          </button>
          {open && !codeReady && (
            <AssistantStatusMessage>Preparing code…</AssistantStatusMessage>
          )}
          {open && codeReady && (
            <pre className="overflow-x-auto p-3 text-xs leading-relaxed">
              <code className="font-mono">{code}</code>
            </pre>
          )}
        </div>
      )}
      {!streamingInput && !done && (
        <AssistantStatusMessage>Rendering model…</AssistantStatusMessage>
      )}
      {!streamingInput && done && (
        <div
          className={cn(
            "flex items-center gap-1.5 px-1 text-xs",
            failed ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {!failed && (
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          )}
          {failed && <AlertCircle className="size-3.5" />}
          <span>
            {!failed &&
              `Rendered${out?.triangleCount ? ` · ${out.triangleCount.toLocaleString()} triangles` : ""}`}
            {failed && "OpenSCAD failed to render"}
          </span>
        </div>
      )}
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
  previousCodeFor?: (messageId: string, buildIndex: number) => string | undefined;
}

function ChatMessageBase({
  message,
  previousCodeFor,
}: ChatMessageProps) {
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
  const selection =
    (message.metadata as ChatMessageMetadata | undefined)?.selection ?? [];
  const measurements =
    (message.metadata as ChatMessageMetadata | undefined)?.measurements ?? [];

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
        {isUser && selection.length > 0 && (
          <MessageSelectionContext selection={selection} />
        )}
        {isUser && measurements.length > 0 && (
          <MessageMeasurementContext measurements={measurements} />
        )}
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
          <BuildCard
            key={i}
            part={part}
            previousCode={previousCodeFor?.(message.id, i)}
          />
        ))}
      </div>
    </div>
  );
}

export const ChatMessage = memo(ChatMessageBase);
