import { create } from "zustand";
import type { TopologySelection } from "~/types";

interface SelectionState {
  selection: TopologySelection[];
  toggle: (sel: TopologySelection) => void;
  remove: (kind: TopologySelection["kind"], id: string) => void;
  clear: () => void;
}

export const useSelectionStore = create<SelectionState>((set) => ({
  selection: [],
  toggle: (sel) =>
    set((s) => {
      const exists = s.selection.some(
        (x) => x.kind === sel.kind && x.id === sel.id,
      );
      return {
        selection: exists
          ? s.selection.filter(
              (x) => !(x.kind === sel.kind && x.id === sel.id),
            )
          : [...s.selection, sel],
      };
    }),
  remove: (kind, id) =>
    set((s) => ({
      selection: s.selection.filter(
        (x) => !(x.kind === kind && x.id === id),
      ),
    })),
  clear: () => set({ selection: [] }),
}));
