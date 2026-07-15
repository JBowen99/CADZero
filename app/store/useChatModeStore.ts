import { create } from "zustand";
import type { ChatMode } from "~/types";

interface ChatModeState {
  mode: ChatMode;
  setMode: (mode: ChatMode) => void;
}

export const useChatModeStore = create<ChatModeState>((set) => ({
  mode: "build",
  setMode: (mode) => set({ mode }),
}));
