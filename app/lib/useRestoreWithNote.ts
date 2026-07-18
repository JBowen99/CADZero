import { useCallback } from "react";
import type { UIMessage } from "ai";
import { useChatActions, useChatLiveMessagesRef } from "~/lib/ai-chat";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { revisionsUrl } from "~/lib/api";
import type { RevisionDTO } from "~/types";

export interface RestoreEventMessage extends UIMessage {
  kind?: string;
}

export const RESTORE_EVENT_KIND = "restore";

function buildRestoreText(
  version: number | null,
  label: string | null,
  message: string | null,
): string {
  const where = version != null ? `v${version}` : "an earlier version";
  const named = label ?? message;
  const suffix = named ? ` (“${named}”)` : "";
  return `Restored to ${where}${suffix}. Continuing the design from this earlier point — newer revisions are preserved in history.`;
}

export function useRestoreWithNote() {
  const restoreRevision = useDocumentsStore((s) => s.restoreRevision);
  const snapshotChat = useDocumentsStore((s) => s.snapshotChat);
  const { setMessages } = useChatActions();
  const liveMessagesRef = useChatLiveMessagesRef();

  return useCallback(
    async (revId: string) => {
      const clientId = useDocumentsStore.getState().activeClientId;
      const partId = useDocumentsStore.getState().activeId;

      await restoreRevision(revId);

      let version: number | null = null;
      let label: string | null = null;
      let message: string | null = null;
      if (partId) {
        try {
          const res = await fetch(revisionsUrl(partId));
          if (res.ok) {
            const list: RevisionDTO[] = await res.json();
            const idx = list.findIndex((r) => r.revId === revId);
            if (idx >= 0) {
              version = list.length - idx;
              label = list[idx].label;
              message = list[idx].message;
            }
          }
        } catch {
          /* fall back to a generic note */
        }
      }

      const text = buildRestoreText(version, label, message);
      const msg: RestoreEventMessage = {
        id: crypto.randomUUID(),
        role: "user",
        parts: [{ type: "text", text }],
        kind: RESTORE_EVENT_KIND,
      };

      const activeNow = useDocumentsStore.getState().activeClientId;
      if (clientId && activeNow !== clientId) {
        const doc = useDocumentsStore
          .getState()
          .openDocs.find((d) => d.clientId === clientId);
        if (doc) snapshotChat(clientId, [...doc.chat, msg]);
        return;
      }
      setMessages([...liveMessagesRef.current, msg]);
    },
    [restoreRevision, snapshotChat, setMessages, liveMessagesRef],
  );
}
