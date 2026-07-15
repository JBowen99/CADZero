import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";

const AI_API_URL =
  import.meta.env.VITE_AI_API_URL ?? "http://localhost:8787/api/chat";

type ChatContextValue = ReturnType<typeof useChat>;

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: AI_API_URL }),
    [],
  );
  const chat = useChat({ transport });

  return <ChatContext.Provider value={chat}>{children}</ChatContext.Provider>;
}

export function useChatContext(): ChatContextValue {
  const value = useContext(ChatContext);
  if (!value) {
    throw new Error("useChatContext must be used within a ChatProvider");
  }
  return value;
}

export const isChatBusy = (status: ChatContextValue["status"]) =>
  status === "submitted" || status === "streaming";

export function describeChatError(
  error: Error | undefined | null,
): { title: string; hint: string } {
  if (!error) return { title: "", hint: "" };
  const msg = error.message ?? "";
  if (/failed to fetch|network|load failed|fetch failed|econnrefused/i.test(msg)) {
    return {
      title: "Can't reach the AI backend",
      hint: "Make sure it's running — try `pnpm dev:server`.",
    };
  }
  if (/auth|unauthor|401|api key|no auth|forbidden|403/i.test(msg)) {
    return {
      title: "Model authentication failed",
      hint: "Check OPENROUTER_API_KEY in server/.env.",
    };
  }
  return {
    title: "The model returned an error",
    hint: msg || "Check OPENROUTER_MODEL in server/.env and try again.",
  };
}
