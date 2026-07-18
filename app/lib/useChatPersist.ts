import { useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import {
  isChatBusy,
  useChatLiveMessagesRef,
  useChatState,
  useChatStatus,
} from "~/lib/ai-chat";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { messagesUrl } from "~/lib/api";
import { serializeConversation } from "~/lib/chat-persist";

const DEBOUNCE_MS = 600;

export function useChatPersist() {
  const liveMessagesRef = useChatLiveMessagesRef();
  // Display messages stay referentially stable while tool code streams.
  const { messages: displayMessages } = useChatState();
  const status = useChatStatus();
  const busy = isChatBusy(status);
  const activeClientId = useDocumentsStore((s) => s.activeClientId);
  const saveSignal = useDocumentsStore((s) => s.saveSignal);

  const prevActiveRef = useRef<string | null>(activeClientId);
  const prevBusyRef = useRef(busy);
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
    // Yield so chat/viewport paint before heavy JSON.stringify.
    const run = () => {
      let payload;
      try {
        payload = serializeConversation(msgs);
      } catch {
        useDocumentsStore.getState().setSaveState(clientId, "saved");
        return;
      }
      useDocumentsStore.getState().setSaveState(clientId, "saving");
      void fetch(messagesUrl(doc.partId!), {
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
    if (typeof requestIdleCallback === "function") {
      requestIdleCallback(run, { timeout: 1500 });
    } else {
      setTimeout(run, 0);
    }
  };

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const schedulePersist = () => {
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
    }
    timerRef.current = setTimeout(() => {
      const current = useDocumentsStore.getState().activeClientId;
      if (current) persist(current, liveMessagesRef.current);
    }, DEBOUNCE_MS);
  };

  // Flush the outgoing doc immediately on tab switch (beats the debounce).
  useEffect(() => {
    const prev = prevActiveRef.current;
    const next = activeClientId;
    if (prev === next) return;
    prevActiveRef.current = next;
    clearTimer();
    if (prev) persist(prev, liveMessagesRef.current);
  }, [activeClientId, liveMessagesRef]);

  // Debounced persist on display-message changes; skipped while streaming.
  useEffect(() => {
    if (busy) {
      clearTimer();
      return;
    }
    schedulePersist();
    return clearTimer;
  }, [displayMessages, busy]);

  // Flush once when the stream finishes (covers cases where display msgs were stable).
  useEffect(() => {
    const wasBusy = prevBusyRef.current;
    prevBusyRef.current = busy;
    if (wasBusy && !busy) {
      schedulePersist();
    }
  }, [busy]);

  // Explicit Save (force-flush).
  useEffect(() => {
    if (saveSignal === 0) return;
    clearTimer();
    const ac = useDocumentsStore.getState().activeClientId;
    if (ac) persist(ac, liveMessagesRef.current);
  }, [saveSignal, liveMessagesRef]);

  // Crash-safety: flush the active doc on unload (sync path — no idle defer).
  useEffect(() => {
    const onUnload = () => {
      const ac = useDocumentsStore.getState().activeClientId;
      if (!ac) return;
      const doc = useDocumentsStore
        .getState()
        .openDocs.find((d) => d.clientId === ac);
      if (!doc?.partId || !doc.chatLoaded) return;
      const msgs = liveMessagesRef.current;
      if (msgs.length === 0) return;
      try {
        const payload = serializeConversation(msgs);
        void fetch(messagesUrl(doc.partId), {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: payload }),
          keepalive: true,
        });
      } catch {
        /* ignore */
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [liveMessagesRef]);
}
