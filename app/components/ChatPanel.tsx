import { useEffect, useRef, useState } from "react";
import type { FileUIPart } from "ai";
import { toast } from "sonner";
import { AlertTriangle, ArrowUp, Loader2, MessageSquare, Paperclip, RotateCcw, ScanEye, Square, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { ChatMessage } from "./ChatMessage";
import { describeChatError, isChatBusy, useChatActions, useChatState, useChatStatus } from "~/lib/ai-chat";
import { useChatModeStore } from "~/store/useChatModeStore";
import { useSettingsStore, type AvailableModel } from "~/store/useSettingsStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { modelsUrl } from "~/lib/api";
import { cn } from "~/lib/utils";
import { buildImageParts, extractImageFiles, IMAGE_LIMITS } from "~/lib/images";
import type { ChatMode } from "~/types";

const MODES: { value: ChatMode; label: string }[] = [
  { value: "plan", label: "Plan" },
  { value: "chat", label: "Chat" },
  { value: "build", label: "Build" },
];

const PLACEHOLDER: Record<ChatMode, string> = {
  plan: "Describe what you want to build — the assistant will plan it…",
  chat: "Ask about the model or OpenSCAD…",
  build: "Describe a part or a change to build…",
};

const EXAMPLE_PROMPTS = [
  "Create a 100 x 60 x 8 mm mounting plate with four M5 clearance holes.",
  "Create a 100 mm cube.",
  "Create a cylinder.",
  "Create a sphere.",
];

function EmptyChat({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <MessageSquare className="size-5 text-muted-foreground" />
      </span>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Describe a part to begin</h3>
        <p className="text-xs text-muted-foreground">
          The assistant will help you model your part through conversation.
        </p>
      </div>
      <div className="flex w-full max-w-xs flex-col gap-1.5">
        {EXAMPLE_PROMPTS.map((example) => (
          <Button
            key={example}
            variant="outline"
            size="sm"
            className="h-auto justify-start whitespace-normal py-2 text-left text-xs"
            onClick={() => onPick(example)}
          >
            {example}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function ChatPanel() {
  const { messages, error } = useChatState();
  const { sendMessage, stop, regenerate } = useChatActions();
  const status = useChatStatus();
  const busy = isChatBusy(status);
  const errorInfo = describeChatError(error);
  const mode = useChatModeStore((s) => s.mode);
  const setMode = useChatModeStore((s) => s.setMode);
  const model = useSettingsStore((s) => s.model);
  const setModel = useSettingsStore((s) => s.setModel);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const chatLoading = useDocumentsStore(
    (s) =>
      s.openDocs.find((d) => d.clientId === s.activeClientId)?.chatLoading ??
      false,
  );

  const [value, setValue] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const [models, setModels] = useState<AvailableModel[]>([]);
  const [modelsError, setModelsError] = useState(false);
  const [images, setImages] = useState<FileUIPart[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const visionModel =
    models.find((m) => m.id === model)?.supportsVision ?? false;

  useEffect(() => {
    if (!settingsLoaded) return;
    let cancelled = false;
    void fetch(modelsUrl)
      .then((r) => r.json())
      .then((data: { models?: AvailableModel[] }) => {
        if (cancelled) return;
        const list = data.models ?? [];
        setModels(list);
        setModelsError(list.length === 0);
        if (!useSettingsStore.getState().model && list[0]) {
          setModel(list[0].id);
        }
      })
      .catch(() => {
        if (!cancelled) setModelsError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [setModel, settingsLoaded]);

  const messageCount = messages.length;
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [messageCount, status]);

  useEffect(() => {
    setDismissed(false);
  }, [error]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed && images.length === 0) return;
    if (busy) return;
    if (trimmed) {
      sendMessage({
        text: trimmed,
        files: images.length > 0 ? images : undefined,
      });
    } else {
      sendMessage({ files: images });
    }
    setImages([]);
    setValue("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  const addFiles = async (files: File[]) => {
    if (!visionModel) {
      toast.error("The selected model can't read images.", {
        description: "Switch to a vision-capable model to attach images.",
      });
      return;
    }
    const remaining = IMAGE_LIMITS.maxCount - images.length;
    if (remaining <= 0) {
      toast.error(`You can attach at most ${IMAGE_LIMITS.maxCount} images.`);
      return;
    }
    const { added, rejected } = await buildImageParts(files, remaining);
    if (added.length > 0) setImages((prev) => [...prev, ...added]);
    for (const r of rejected) {
      toast.error(`Skipped "${r.file.name}"`, { description: r.reason });
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = extractImageFiles(e.clipboardData?.items);
    if (files.length > 0) {
      e.preventDefault();
      void addFiles(files);
    }
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const files = extractImageFiles(e.dataTransfer?.items ?? e.dataTransfer?.files);
    if (files.length > 0) void addFiles(files);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!visionModel) return;
    if (Array.from(e.dataTransfer?.types ?? []).includes("Files")) {
      e.preventDefault();
      setDragActive(true);
    }
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget === e.target) setDragActive(false);
  };

  const openFilePicker = () => {
    if (!visionModel) {
      toast.error("The selected model can't read images.", {
        description: "Switch to a vision-capable model to attach images.",
      });
      return;
    }
    fileInputRef.current?.click();
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = extractImageFiles(e.target.files);
    if (files.length > 0) void addFiles(files);
    e.target.value = "";
  };

  return (
    <div className="flex h-full w-full min-w-0 flex-col">
      {chatLoading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading conversation…
        </div>
      ) : messages.length === 0 ? (
        <div className="flex-1 overflow-hidden">
          <EmptyChat onPick={(p) => sendMessage({ text: p })} />
        </div>
      ) : (
        <ScrollArea className="min-h-0 flex-1 overflow-hidden">
          <div className="flex flex-col py-2">
            {messages.map((message, i) => (
              <div key={message.id}>
                <ChatMessage message={message} />
                {i < messages.length - 1 && <Separator />}
              </div>
            ))}
            {status === "submitted" && (
              <div className="flex items-center gap-2 px-4 py-3 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin" />
                Assistant is thinking…
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>
      )}

      <Separator />

      {error && !dismissed && (
        <div className="flex items-start gap-2 border-l-2 border-destructive/60 bg-destructive/10 px-3 py-2">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">{errorInfo.title}</p>
            <p className="text-destructive/80">{errorInfo.hint}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 gap-1 px-2 text-xs"
            onClick={() => regenerate()}
          >
            <RotateCcw className="size-3" />
            Retry
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="shrink-0 text-destructive"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss error"
          >
            <X className="size-3.5" />
          </Button>
        </div>
      )}

      <div
        className={cn(
          "relative shrink-0 p-3",
          dragActive && "ring-2 ring-inset ring-primary/60",
        )}
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
      >
        {dragActive && (
          <div className="pointer-events-none absolute inset-2 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary/60 bg-background/80 text-xs font-medium text-primary">
            Drop images to attach
          </div>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept={IMAGE_LIMITS.accept}
          multiple
          className="hidden"
          onChange={onFileChange}
        />
        <Textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          placeholder={
            visionModel
              ? PLACEHOLDER[mode]
              : PLACEHOLDER[mode] + " (current model can't read images)"
          }
          className="min-h-[72px] max-h-[200px] resize-none text-sm"
        />
        {images.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="group relative size-14 overflow-hidden rounded-md border"
              >
                <img
                  src={img.url}
                  alt={img.filename ?? "attached image"}
                  className="size-full object-cover"
                />
                <button
                  type="button"
                  className="absolute right-0.5 top-0.5 flex size-4 items-center justify-center rounded-full bg-background/80 text-foreground opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() =>
                    setImages((prev) => prev.filter((_, idx) => idx !== i))
                  }
                  aria-label="Remove image"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Select value={mode} onValueChange={(v) => setMode(v as ChatMode)}>
            <SelectTrigger size="sm" className="h-7 gap-1 px-2 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODES.map((m) => (
                <SelectItem key={m.value} value={m.value} className="text-xs">
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={model ?? undefined}
            onValueChange={setModel}
            disabled={models.length === 0}
          >
            <SelectTrigger size="sm" className="h-7 min-w-0 flex-1 gap-1 px-2 text-xs">
              <SelectValue
                placeholder={
                  modelsError ? "Models unavailable" : "Loading models…"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {models.map((m) => (
                <SelectItem key={m.id} value={m.id} className="text-xs">
                  <ScanEye
                    className={cn(
                      "size-3 shrink-0",
                      m.supportsVision
                        ? "text-primary"
                        : "text-muted-foreground/30",
                    )}
                  />
                  <span className="truncate">{m.name}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="h-7 w-7 shrink-0 text-muted-foreground"
            onClick={openFilePicker}
            disabled={!visionModel}
            aria-label="Attach images"
            title={
              visionModel
                ? "Attach images"
                : "Selected model can't read images"
            }
          >
            <Paperclip className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon-sm"
            className="h-7 w-7 shrink-0"
            onClick={busy ? stop : submit}
            disabled={
              (!busy && !value.trim() && images.length === 0) ||
              (!!previewingRevId && !busy)
            }
            aria-label={busy ? "Stop generating" : "Send prompt"}
            title={
              previewingRevId && !busy
                ? "Exit history preview to build"
                : undefined
            }
          >
            {busy ? (
              status === "streaming" ? (
                <Square className="size-3.5" />
              ) : (
                <Loader2 className="size-4 animate-spin" />
              )
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </div>
        <p className="mt-1.5 text-[10px] text-muted-foreground">
          {previewingRevId
            ? "Viewing an older version — restore or return to current to build."
            : "⌘/Ctrl + Enter to send"}
        </p>
      </div>
    </div>
  );
}
