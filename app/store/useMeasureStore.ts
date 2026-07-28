import { create } from "zustand";
import type { MeasureMode, MeasurePick, MeasureResult } from "~/types";

export type MeasureStatus = "idle" | "pending" | "error";

const CHAIN_CAP = 50;

interface MeasureState {
  /** Master on/off for measure mode (driven by the viewport toolbar). */
  active: boolean;
  mode: MeasureMode;
  picks: MeasurePick[];
  results: MeasureResult[];
  status: MeasureStatus;
  error: string | null;
  /** Monotonic token bumped whenever picks change — the dispatch hook keys off it. */
  revision: number;
  /** Measurements staged for chat context (accumulates across multiple "Add to chat" clicks). */
  contextResults: MeasureResult[];
  /** Index of the context item currently hovered in the chat popover (for viewport highlight). */
  hoveredContextIndex: number | null;

  setActive: (v: boolean) => void;
  setMode: (m: MeasureMode) => void;
  pick: (p: MeasurePick) => void;
  undo: () => void;
  clear: () => void;
  /** Stage the current results into the chat context buffer. */
  addToContext: () => void;
  /** Remove a single measurement from the context buffer by index. */
  removeFromContext: (index: number) => void;
  /** Clear the chat context buffer (called after sending a message). */
  clearContext: () => void;
  /** Set the hovered context index (for viewport highlight from the chat popover). */
  setHoveredContext: (index: number | null) => void;
  /** Internal: used by the dispatch hook to publish server results. */
  publish: (results: MeasureResult[], status: MeasureStatus, error?: string | null) => void;
}

export const useMeasureStore = create<MeasureState>((set) => ({
  active: false,
  mode: "pair",
  picks: [],
  results: [],
  status: "idle",
  error: null,
  revision: 0,
  contextResults: [],
  hoveredContextIndex: null,

  setActive: (v) =>
    set((s) =>
      v === s.active
        ? s
        : {
            active: v,
            picks: [],
            results: [],
            status: "idle",
            error: null,
            revision: s.revision + 1,
          },
    ),

  setMode: (m) =>
    set((s) =>
      m === s.mode
        ? s
        : {
            mode: m,
            picks: [],
            results: [],
            status: "idle",
            error: null,
            revision: s.revision + 1,
          },
    ),

  pick: (p) =>
    set((s) => {
      // De-dupe consecutive identical picks (double-click on the same entity).
      const last = s.picks[s.picks.length - 1];
      if (last && last.kind === p.kind && last.id === p.id) return s;

      let picks: MeasurePick[];
      if (s.mode === "single") {
        picks = [p];
      } else if (s.mode === "pair") {
        // Sliding window of 2 — the new pair becomes (last, p) so users can compare
        // against a moving reference. If the prior pick was identical, just replace.
        picks = s.picks.length >= 1 ? [s.picks[s.picks.length - 1], p] : [p];
      } else {
        // Chain: append up to a sane cap (drop oldest beyond the cap).
        picks = [...s.picks, p];
        if (picks.length > CHAIN_CAP) picks = picks.slice(picks.length - CHAIN_CAP);
      }
      return {
        picks,
        results: [],
        status: "pending",
        error: null,
        revision: s.revision + 1,
      };
    }),

  undo: () =>
    set((s) => {
      if (s.picks.length === 0) return s;
      const picks = s.picks.slice(0, -1);
      return {
        picks,
        results: [],
        status: picks.length === 0 ? "idle" : "pending",
        error: null,
        revision: s.revision + 1,
      };
    }),

  clear: () =>
    set((s) =>
      s.picks.length === 0 && s.results.length === 0
        ? s
        : {
            picks: [],
            results: [],
            status: "idle",
            error: null,
            revision: s.revision + 1,
          },
    ),

  addToContext: () =>
    set((s) => {
      if (s.results.length === 0) return s;
      return { contextResults: [...s.contextResults, ...s.results] };
    }),

  clearContext: () =>
    set((s) =>
      s.contextResults.length === 0 ? s : { contextResults: [], hoveredContextIndex: null },
    ),

  removeFromContext: (index) =>
    set((s) => {
      if (index < 0 || index >= s.contextResults.length) return s;
      return {
        contextResults: s.contextResults.filter((_, i) => i !== index),
        hoveredContextIndex: null,
      };
    }),

  setHoveredContext: (index) => set({ hoveredContextIndex: index }),

  publish: (results, status, error = null) =>
    set((s) => ({ results, status, error })),
}));
