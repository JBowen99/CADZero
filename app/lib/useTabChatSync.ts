import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useChatActions, useChatState } from "~/lib/ai-chat";
import { useDocumentsStore } from "~/store/useDocumentsStore";

export function useTabChatSync() {
  const { messages } = useChatState();
  const { setMessages } = useChatActions();
  const activeClientId = useDocumentsStore((s) => s.activeClientId);
  const snapshotChat = useDocumentsStore((s) => s.snapshotChat);
  const loadChat = useDocumentsStore((s) => s.loadChat);

  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;
  const prevActiveRef = useRef<string | null>(activeClientId);

  useEffect(() => {
    const prev = prevActiveRef.current;
    const next = activeClientId;
    if (prev === next) return;
    prevActiveRef.current = next;
    if (prev) snapshotChat(prev, messagesRef.current);
    if (next === null) {
      setMessages([]);
      return;
    }

    const incoming = useDocumentsStore
      .getState()
      .openDocs.find((d) => d.clientId === next);
    if (!incoming) {
      setMessages([]);
      return;
    }
    if (incoming.chatLoaded) {
      setMessages(incoming.chat);
      return;
    }
    setMessages([]);
    void loadChat(next).then((loaded) => {
      if (useDocumentsStore.getState().activeClientId === next) {
        setMessages(loaded);
      }
    });
  }, [activeClientId, setMessages, snapshotChat, loadChat]);
}
