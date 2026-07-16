import type { UIMessage } from "ai";
import type { StoredMessage } from "~/types";

interface ToolPartShape {
  type?: string;
  output?: { revId?: string };
}

function extractProducedRevId(msg: UIMessage): string | null {
  const parts = msg.parts as unknown[];
  for (const p of parts) {
    if (
      typeof p === "object" &&
      p !== null &&
      (p as ToolPartShape).type === "tool-update_model"
    ) {
      const revId = (p as ToolPartShape).output?.revId;
      if (revId) return revId;
    }
  }
  return null;
}

export function serializeMessage(msg: UIMessage): StoredMessage {
  const createdAtValue = (msg as { createdAt?: unknown }).createdAt;
  const createdAt =
    createdAtValue instanceof Date
      ? createdAtValue.getTime()
      : typeof createdAtValue === "string"
        ? Date.parse(createdAtValue)
        : Date.now();
  return {
    msgId: msg.id,
    role: msg.role === "user" ? "user" : "assistant",
    partsJson: JSON.stringify(msg),
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    producedRevId: extractProducedRevId(msg),
  };
}

export function serializeConversation(msgs: UIMessage[]): StoredMessage[] {
  return msgs.map(serializeMessage);
}

export function deserializeMessages(records: StoredMessage[]): UIMessage[] {
  const out: UIMessage[] = [];
  for (const r of records) {
    try {
      const parsed = JSON.parse(r.partsJson) as UIMessage & {
        createdAt?: unknown;
      };
      if (typeof parsed.createdAt === "string") {
        parsed.createdAt = new Date(parsed.createdAt);
      }
      out.push(parsed as UIMessage);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
