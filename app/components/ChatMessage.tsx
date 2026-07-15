import { Bot, User } from "lucide-react";
import type { ChatMessage as ChatMessageType } from "~/types";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { CodeBlock } from "./CodeBlock";
import { cn } from "~/lib/utils";

interface ChatMessageProps {
  message: ChatMessageType;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={cn(
        "flex w-full gap-3 px-4 py-3",
        isUser && "flex-row-reverse",
      )}
    >
      <Avatar className="size-7 shrink-0 border">
        <AvatarFallback
          className={cn(
            "text-[11px]",
            isUser ? "bg-primary text-primary-foreground" : "bg-muted",
          )}
        >
          {isUser ? <User className="size-3.5" /> : <Bot className="size-3.5" />}
        </AvatarFallback>
      </Avatar>

      <div
        className={cn(
          "flex min-w-0 max-w-[85%] flex-col gap-2",
          isUser && "items-end",
        )}
      >
        <div
          className={cn(
            "whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm",
            isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {message.content}
        </div>

        {message.cadCode && (
          <div className="w-full space-y-1.5">
            {message.language && (
              <Badge variant="secondary" className="uppercase">
                {message.language}
              </Badge>
            )}
            <CodeBlock
              code={message.cadCode}
              language={message.language ?? "code"}
            />
          </div>
        )}
      </div>
    </div>
  );
}
