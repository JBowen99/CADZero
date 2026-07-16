import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { chatApiUrl } from "~/lib/api";
import { useModelStore } from "~/store/useModelStore";
import { useChatModeStore } from "~/store/useChatModeStore";
import { useSettingsStore } from "~/store/useSettingsStore";

type ChatInstance = ReturnType<typeof useChat>;
type ChatStatus = ChatInstance["status"];

interface ChatActions {
  sendMessage: ChatInstance["sendMessage"];
  stop: ChatInstance["stop"];
  regenerate: ChatInstance["regenerate"];
  setMessages: ChatInstance["setMessages"];
}

interface ChatState {
  messages: ChatInstance["messages"];
  error: ChatInstance["error"];
}

const ActionsContext = createContext<ChatActions | null>(null);
const StatusContext = createContext<ChatStatus | null>(null);
const StateContext = createContext<ChatState | null>(null);
const HasMessagesContext = createContext<boolean>(false);

export function ChatProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatApiUrl,
        prepareSendMessagesRequest: ({ body, messages }) => ({
          body: {
            ...body,
            messages,
            mode: useChatModeStore.getState().mode,
            model: useSettingsStore.getState().model,
            cadCode: useModelStore.getState().cadCode,
            language: useModelStore.getState().language,
          },
        }),
      }),
    [],
  );
  const chat = useChat({ transport, throttle: 50 });

  const actions = useMemo<ChatActions>(
    () => ({
      sendMessage: chat.sendMessage,
      stop: chat.stop,
      regenerate: chat.regenerate,
      setMessages: chat.setMessages,
    }),
    [chat.sendMessage, chat.stop, chat.regenerate, chat.setMessages],
  );
  const state = useMemo<ChatState>(
    () => ({ messages: chat.messages, error: chat.error }),
    [chat.messages, chat.error],
  );
  const hasMessages = chat.messages.length > 0;

  return (
    <ActionsContext.Provider value={actions}>
      <StatusContext.Provider value={chat.status}>
        <StateContext.Provider value={state}>
          <HasMessagesContext.Provider value={hasMessages}>
            {children}
          </HasMessagesContext.Provider>
        </StateContext.Provider>
      </StatusContext.Provider>
    </ActionsContext.Provider>
  );
}

function useActions(): ChatActions {
  const value = useContext(ActionsContext);
  if (!value) {
    throw new Error("Chat hooks must be used within a ChatProvider");
  }
  return value;
}

function useStateValue(): ChatState {
  const value = useContext(StateContext);
  if (!value) {
    throw new Error("Chat hooks must be used within a ChatProvider");
  }
  return value;
}

export function useChatActions(): ChatActions {
  return useActions();
}

export function useChatStatus(): ChatStatus {
  const value = useContext(StatusContext);
  if (value === null) {
    throw new Error("Chat hooks must be used within a ChatProvider");
  }
  return value;
}

export function useChatState(): ChatState {
  return useStateValue();
}

export function useChatMessages() {
  return useStateValue().messages;
}

export function useChatHasMessages(): boolean {
  return useContext(HasMessagesContext);
}

export const isChatBusy = (status: ChatStatus) =>
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
