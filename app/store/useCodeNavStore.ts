import { create } from "zustand";

interface CodeNavState {
  targetLine: number | null;
  sidePanelTab: "chat" | "code" | "params" | "history";
  setTargetLine: (n: number | null) => void;
  setSidePanelTab: (tab: CodeNavState["sidePanelTab"]) => void;
  navigateToLine: (n: number) => void;
}

export const useCodeNavStore = create<CodeNavState>((set) => ({
  targetLine: null,
  sidePanelTab: "chat",
  setTargetLine: (n) => set({ targetLine: n }),
  setSidePanelTab: (tab) => set({ sidePanelTab: tab }),
  navigateToLine: (n) => set({ targetLine: n, sidePanelTab: "code" }),
}));
