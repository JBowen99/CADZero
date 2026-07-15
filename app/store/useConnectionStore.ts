import { create } from "zustand";
import type { ConnectionStatus } from "~/types";
import { wsClient } from "~/services/websocket";

interface ConnectionState {
  status: ConnectionStatus;
  connect: () => Promise<void>;
  disconnect: () => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "disconnected",

  connect: async () => {
    wsClient.onStatusChange((status) => set({ status }));
    await wsClient.connect();
  },

  disconnect: () => {
    wsClient.disconnect();
    set({ status: "disconnected" });
  },
}));
