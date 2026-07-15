import { create } from "zustand";
import type { ChatMessage } from "~/types";
import { dummyBackend, newId } from "~/dummy/ai";
import { useModelStore } from "./useModelStore";

interface ChatState {
  messages: ChatMessage[];
  isGenerating: boolean;
  lastError: string | null;
  lastActionAt: number | null;
  sendPrompt: (prompt: string) => Promise<void>;
  clear: () => void;
}

const isCreate = (prompt: string) =>
  /\b(create|make|new|generate|build|add a (cube|box|cylinder|sphere|plate|bracket|mounting))\b/i.test(
    prompt,
  ) && !/\b(increase|decrease|thicker|thinner|larger|smaller|round|fillet|chamfer|remove|delete)\b/i.test(
    prompt,
  );

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [],
  isGenerating: false,
  lastError: null,
  lastActionAt: null,

  sendPrompt: async (prompt) => {
    const trimmed = prompt.trim();
    if (!trimmed || get().isGenerating) return;

    const userMessage: ChatMessage = {
      id: newId(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    set((s) => ({
      messages: [...s.messages, userMessage],
      isGenerating: true,
      lastError: null,
      lastActionAt: Date.now(),
    }));

    try {
      const result = await (get().messages.length > 1 && !isCreate(trimmed)
        ? dummyBackend.modify(trimmed)
        : dummyBackend.create(trimmed));

      const assistantMessage: ChatMessage = {
        id: newId(),
        role: "assistant",
        content: result.message,
        createdAt: Date.now(),
        cadCode: result.cadCode,
        language: result.language,
      };

      if (result.mesh) {
        useModelStore
          .getState()
          .setMesh(result.mesh, result.cadCode, result.language);
      }

      set((s) => ({
        messages: [...s.messages, assistantMessage],
        isGenerating: false,
        lastActionAt: Date.now(),
      }));
    } catch (err) {
      set({
        isGenerating: false,
        lastError: err instanceof Error ? err.message : "Generation failed",
        lastActionAt: Date.now(),
      });
    }
  },

  clear: () => {
    useModelStore.getState().clear();
    set({ messages: [], lastError: null, lastActionAt: null });
  },
}));
