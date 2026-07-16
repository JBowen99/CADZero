import { create } from "zustand";
import type { PartSummary, WorkspaceInfo } from "~/types";
import { workspaceUrl } from "~/lib/api";

interface WorkspaceState {
  root: string | null;
  configured: boolean;
  parts: PartSummary[];
  initialized: boolean;
  init: () => Promise<void>;
  refresh: () => Promise<void>;
  setRoot: (path: string) => Promise<string | null>;
}

async function fetchWorkspace(): Promise<WorkspaceInfo> {
  const res = await fetch(workspaceUrl);
  if (!res.ok) throw new Error(`workspace fetch failed: ${res.status}`);
  return res.json();
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  root: null,
  configured: false,
  parts: [],
  initialized: false,

  init: async () => {
    try {
      const info = await fetchWorkspace();
      set({
        root: info.root,
        configured: info.configured,
        parts: info.parts,
        initialized: true,
      });
    } catch {
      set({ initialized: true });
    }
  },

  refresh: async () => {
    try {
      const info = await fetchWorkspace();
      set({ root: info.root, configured: info.configured, parts: info.parts });
    } catch {
      /* keep last known state */
    }
  },

  setRoot: async (path) => {
    const res = await fetch(workspaceUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ root: path }),
    });
    if (!res.ok) return null;
    const info: WorkspaceInfo = await res.json();
    set({
      root: info.root,
      configured: info.configured,
      parts: info.parts,
    });
    return info.root;
  },
}));
