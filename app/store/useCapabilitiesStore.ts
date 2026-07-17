import { create } from "zustand";
import { capabilitiesUrl } from "~/lib/api";

export interface CapabilityState {
  ok: boolean;
  version?: string;
  error?: string;
}

interface CapabilitiesStore {
  openscad: CapabilityState;
  build123d: CapabilityState;
  loaded: boolean;
  load: () => Promise<void>;
}

const UNKNOWN: CapabilityState = { ok: false, error: "not checked yet" };

export const useCapabilitiesStore = create<CapabilitiesStore>((set, get) => ({
  openscad: UNKNOWN,
  build123d: UNKNOWN,
  loaded: false,

  load: async () => {
    try {
      const res = await fetch(capabilitiesUrl);
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const data = (await res.json()) as {
        openscad?: CapabilityState;
        build123d?: CapabilityState;
      };
      set({
        openscad: data.openscad ?? UNKNOWN,
        build123d: data.build123d ?? UNKNOWN,
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },
}));

export const build123dAvailable = () =>
  useCapabilitiesStore.getState().build123d.ok;
