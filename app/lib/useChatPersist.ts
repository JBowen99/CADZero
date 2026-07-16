import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { useChatState } from "~/lib/ai-chat";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { messagesUrl } from "~/lib/api";
import { serializeConversation } from "~/lib/chat-persist";

const DEBOUNCE_MS = 600;

export function useChatPersist() {
  const { messages } = useChatState();
  const activeClientId = useDocumentsStore((s) => s.activeClientId);
  const saveSignal = useDocumentsStore((s) => s.saveSignal);

  const messagesRef = useRef<UIMessage[]>(messages);
  messagesRef.current = messages;
  const prevActiveRef = useRef<string | null>(activeClientId);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = (clientId: string, msgs: UIMessage[]) => {
    const doc = useDocumentsStore
      .getState()
      .openDocs.find((d) => d.clientId === clientId);
    if (!doc?.partId || !doc.chatLoaded) {
      if (doc && !doc.partId) {
        useDocumentsStore.getState().setSaveState(clientId, "unsaved");
      }
      return;
    }
    if (msgs.length === 0) {
      useDocumentsStore.getState().setSaveState(clientId, "saved");
      return;
    }
    let payload;
    try {
      payload = serializeConversation(msgs);
    } catch {
      useDocumentsStore.getState().setSaveState(clientId, "saved");
      return;
    }
    useDocumentsStore.getState().setSaveState(clientId, "saving");
    void fetch(messagesUrl(doc.partId), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload }),
    })
      .then((res) => {
        useDocumentsStore.getState().setSaveState(
          clientId,
          res.ok ? "saved" : "unsaved",
        );
      })
      .catch(() => {
        useDocumentsStore.getState().setSaveState(clientId, "unsaved");
      });
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // Flush the outgoing doc immediately on tab switch (beats the debounce).
  useEffect(() => {
    const prev = prevActiveRef.current;
    const next = activeClientId;
    if (prev === next) return;
    prevActiveRef.current = next;
    clearTimer();
    if (prev) persist(prev, messagesRef.current);
  }, [activeClientId]);

  // Debounced persist of the ACTIVE doc only when messages actually change.
  useEffect(() => {
    clearTimer();
    const ac = useDocumentsStore.getState().activeClientId;
    if (ac) {
      const doc = useDocumentsStore
        .getState()
        .openDocs.find((d) => d.clientId === ac);
      if (doc?.partId && doc.chatLoaded) {
        useDocumentsStore.getState().setSaveState(ac, "saving");
      } else if (doc && !doc.partId) {
        useDocumentsStore.getState().setSaveState(ac, "unsaved");
      }
      // partId && !chatLoaded: still loading — don't flip to "saving" (can't redeem it)
    }
    timerRef.current = setTimeout(() => {
      const current = useDocumentsStore.getState().activeClientId;
      if (current) persist(current, messagesRef.current);
    }, DEBOUNCE_MS);
    return clearTimer;
  }, [messages]);

  // Explicit Save (force-flush).
  useEffect(() => {
    if (saveSignal === 0) return;
    clearTimer();
    const ac = useDocumentsStore.getState().activeClientId;
    if (ac) persist(ac, messagesRef.current);
  }, [saveSignal]);

  // Crash-safety: flush the active doc on unload.
  useEffect(() => {
    const onUnload = () => {
      const ac = useDocumentsStore.getState().activeClientId;
      if (ac) persist(ac, messagesRef.current);
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
}
