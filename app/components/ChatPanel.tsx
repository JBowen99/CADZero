import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, Loader2, MessageSquare, RotateCcw, Square, X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Textarea } from "~/components/ui/textarea";
import { ScrollArea } from "~/components/ui/scroll-area";
import { Separator } from "~/components/ui/separator";
import { ChatMessage } from "./ChatMessage";
import { describeChatError, isChatBusy, useChatContext } from "~/lib/ai-chat";

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
  const { messages, sendMessage, status, stop, error, regenerate } =
    useChatContext();
  const busy = isChatBusy(status);
  const errorInfo = describeChatError(error);

  const [value, setValue] = useState("");
  const [dismissed, setDismissed] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    setDismissed(false);
  }, [error]);

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || busy) return;
    sendMessage({ text: trimmed });
    setValue("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <aside className="flex h-full w-full min-w-0 flex-col border-l bg-background">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <MessageSquare className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Chat</span>
      </div>

      {messages.length === 0 ? (
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

      <div className="shrink-0 p-3">
        <div className="relative">
          <Textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Describe a part or a change…"
            disabled={busy}
            className="min-h-[72px] max-h-[200px] resize-none pr-10 text-sm"
          />
          <Button
            type="button"
            size="icon-sm"
            className="absolute bottom-2 right-2"
            onClick={busy ? stop : submit}
            disabled={!busy && !value.trim()}
            aria-label={busy ? "Stop generating" : "Send prompt"}
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
          ⌘/Ctrl + Enter to send
        </p>
      </div>
    </aside>
  );
}
