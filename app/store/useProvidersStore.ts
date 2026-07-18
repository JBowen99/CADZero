import { create } from "zustand";
import { providerKeyUrl, providerUrl } from "~/lib/api";

export interface ProviderInfo {
  configured: boolean;
}

interface ProviderStatus {
  activeProvider: string | null;
  providers: Record<string, ProviderInfo>;
}

interface ProvidersState extends ProviderStatus {
  loaded: boolean;
  load: () => Promise<void>;
  setKey: (provider: string, apiKey: string) => Promise<boolean>;
}

export const useProvidersStore = create<ProvidersState>((set) => ({
  activeProvider: null,
  providers: {},
  loaded: false,

  load: async () => {
    try {
      const res = await fetch(providerUrl);
      if (!res.ok) {
        set({ loaded: true });
        return;
      }
      const data: ProviderStatus = await res.json();
      set({
        activeProvider: data.activeProvider ?? null,
        providers: data.providers ?? {},
        loaded: true,
      });
    } catch {
      set({ loaded: true });
    }
  },

  setKey: async (provider, apiKey) => {
    try {
      const res = await fetch(providerKeyUrl(provider), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey }),
      });
      if (!res.ok) return false;
      const data: ProviderStatus = await res.json();
      set({
        activeProvider: data.activeProvider ?? null,
        providers: data.providers ?? {},
      });
      return true;
    } catch {
      return false;
    }
  },
}));

export const openrouterConfigured = (): boolean =>
  Boolean(useProvidersStore.getState().providers.openrouter?.configured);
