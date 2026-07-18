import {
  createContext,
  useContext,
  useMemo,
  useRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { chatApiUrl } from "~/lib/api";
import { useModelStore } from "~/store/useModelStore";
import { useChatModeStore } from "~/store/useChatModeStore";
import { useSettingsStore } from "~/store/useSettingsStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useSelectionStore } from "~/store/useSelectionStore";
import type { ChatMessageMetadata, TopologySelection } from "~/types";

type ChatInstance = ReturnType<typeof useChat>;
type ChatStatus = ChatInstance["status"];

interface ChatActions {
  sendMessage: ChatInstance["sendMessage"];
  stop: ChatInstance["stop"];
  regenerate: ChatInstance["regenerate"];
  setMessages: ChatInstance["setMessages"];
}

function selectionFromMessageMetadata(
  messages: UIMessage[],
): TopologySelection[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (msg.role !== "user") continue;
    const sel = (msg.metadata as ChatMessageMetadata | undefined)?.selection;
    if (Array.isArray(sel) && sel.length > 0) return sel;
    break;
  }
  return [];
}

function withSelectionMetadata(
  message: Parameters<ChatInstance["sendMessage"]>[0],
): Parameters<ChatInstance["sendMessage"]>[0] {
  if (message == null) return message;
  const live = useSelectionStore.getState().selection;
  if (live.length === 0) return message;
  const existing = message.metadata as ChatMessageMetadata | undefined;
  if (existing?.selection && existing.selection.length > 0) return message;
  return {
    ...message,
    metadata: {
      ...existing,
      selection: live.map((s) => ({ ...s })),
    } satisfies ChatMessageMetadata,
  };
}

interface ChatState {
  messages: ChatInstance["messages"];
  error: ChatInstance["error"];
}

interface BuildPart {
  type: `tool-${string}`;
  state?: string;
  input?: { code?: string; message?: string; language?: string };
}

/**
 * Signature for UI-relevant message changes. Intentionally ignores growing
 * tool `code` while `input-streaming` so React context stays stable.
 */
function displayMessagesSignature(messages: UIMessage[]): string {
  const last = messages[messages.length - 1];
  if (!last) return "0";
  let sig = `${messages.length}:${last.id}:${last.role}`;
  const parts = last.parts as unknown[] | undefined;
  if (!parts) return sig;
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as {
      type?: string;
      text?: string;
      state?: string;
      toolCallId?: string;
      input?: { message?: string; code?: string };
      output?: { meshId?: string; success?: boolean };
    };
    if (p.type === "text") {
      sig += `:t${p.text?.length ?? 0}`;
      continue;
    }
    if (p.type === "tool-update_model") {
      sig += `:u${p.state ?? ""}:${p.toolCallId ?? ""}`;
      sig += `:m${p.input?.message?.length ?? 0}`;
      if (p.state === "input-streaming") {
        sig += ":cs";
      } else {
        sig += `:c${p.input?.code?.length ?? 0}`;
      }
      if (p.output) {
        sig += `:o${p.output.success ? 1 : 0}:${p.output.meshId ?? ""}`;
      }
    }
  }
  return sig;
}

function stripStreamingToolCode(messages: UIMessage[]): UIMessage[] {
  const lastIdx = messages.length - 1;
  if (lastIdx < 0) return messages;
  const last = messages[lastIdx];
  const parts = last.parts as unknown[] | undefined;
  if (!parts) return messages;

  let changed = false;
  const nextParts = parts.map((raw) => {
    if (!raw || typeof raw !== "object") return raw;
    const p = raw as BuildPart & { state?: string; input?: BuildPart["input"] };
    if (p.type !== "tool-update_model" || p.state !== "input-streaming") {
      return raw;
    }
    if (!p.input?.code) return raw;
    changed = true;
    return {
      ...p,
      input: { ...p.input, code: undefined },
    };
  });

  if (!changed) return messages;
  const next = messages.slice();
  next[lastIdx] = { ...last, parts: nextParts as UIMessage["parts"] };
  return next;
}

function lastResolvedBuildCode(messages: UIMessage[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i]?.parts as unknown[] | undefined;
    if (!parts) continue;
    for (const p of parts) {
      if (
        p &&
        typeof p === "object" &&
        (p as BuildPart).type === "tool-update_model" &&
        (p as BuildPart).state === "output-available"
      ) {
        const code = (p as BuildPart).input?.code;
        if (typeof code === "string") return code;
      }
    }
  }
  return null;
}

/** True when the last assistant message already shows text or a tool card. */
export function assistantHasVisibleParts(messages: UIMessage[]): boolean {
  const last = messages[messages.length - 1];
  if (!last || last.role !== "assistant") return false;
  const parts = last.parts as unknown[] | undefined;
  if (!parts?.length) return false;
  for (const raw of parts) {
    if (!raw || typeof raw !== "object") continue;
    const p = raw as { type?: string; text?: string };
    if (p.type === "text" && p.text && p.text.length > 0) return true;
    if (typeof p.type === "string" && p.type.startsWith("tool-")) return true;
  }
  return false;
}

const ActionsContext = createContext<ChatActions | null>(null);
const StatusContext = createContext<ChatStatus | null>(null);
const StateContext = createContext<ChatState | null>(null);
const HasMessagesContext = createContext<boolean>(false);
const LiveMessagesRefContext =
  createContext<MutableRefObject<UIMessage[]> | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: chatApiUrl,
        prepareSendMessagesRequest: ({ body, messages }) => {
          const cadCode = useModelStore.getState().cadCode;
          const lastBuilt = lastResolvedBuildCode(messages);
          const codeExternallyModified =
            !!cadCode && !!lastBuilt && cadCode !== lastBuilt;
          const liveSelection = useSelectionStore.getState().selection;
          const selection =
            liveSelection.length > 0
              ? liveSelection
              : selectionFromMessageMetadata(messages);
          return {
            body: {
              ...body,
              messages,
              mode: useChatModeStore.getState().mode,
              model: useSettingsStore.getState().model,
              cadCode,
              language: useModelStore.getState().language,
              partId: useDocumentsStore.getState().activeId,
              selection,
              codeExternallyModified,
            },
          };
        },
      }),
    [],
  );
  const chat = useChat({ transport, throttle: 50 });

  const liveMessagesRef = useRef<UIMessage[]>(chat.messages);
  liveMessagesRef.current = chat.messages;

  const displayCacheRef = useRef<{
    sig: string;
    messages: UIMessage[];
  }>({ sig: "", messages: [] });

  const displayMessages = useMemo(() => {
    const sig = displayMessagesSignature(chat.messages);
    if (sig === displayCacheRef.current.sig) {
      return displayCacheRef.current.messages;
    }
    const next = stripStreamingToolCode(chat.messages);
    displayCacheRef.current = { sig, messages: next };
    return next;
  }, [chat.messages]);

  const actions = useMemo<ChatActions>(
    () => ({
      sendMessage: (message, options) =>
        chat.sendMessage(withSelectionMetadata(message), options),
      stop: chat.stop,
      regenerate: chat.regenerate,
      setMessages: chat.setMessages,
    }),
    [chat.sendMessage, chat.stop, chat.regenerate, chat.setMessages],
  );
  const state = useMemo<ChatState>(
    () => ({ messages: displayMessages, error: chat.error }),
    [displayMessages, chat.error],
  );
  const hasMessages = displayMessages.length > 0;

  return (
    <ActionsContext.Provider value={actions}>
      <StatusContext.Provider value={chat.status}>
        <LiveMessagesRefContext.Provider value={liveMessagesRef}>
          <StateContext.Provider value={state}>
            <HasMessagesContext.Provider value={hasMessages}>
              {children}
            </HasMessagesContext.Provider>
          </StateContext.Provider>
        </LiveMessagesRefContext.Provider>
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

/** Always-current messages including streaming tool code (for persist/tab sync). */
export function useChatLiveMessagesRef(): MutableRefObject<UIMessage[]> {
  const value = useContext(LiveMessagesRefContext);
  if (!value) {
    throw new Error("Chat hooks must be used within a ChatProvider");
  }
  return value;
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
