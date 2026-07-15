import type { BackendResult, ConnectionStatus } from "~/types";

export type WebSocketMessage =
  | { type: "prompt"; id: string; prompt: string; mode: "create" | "modify" }
  | { type: "result"; id: string; result: BackendResult }
  | { type: "error"; id: string; message: string }
  | { type: "status"; status: ConnectionStatus };

type Listener<T = WebSocketMessage> = (msg: T) => void;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Dummy WebSocket-style client.
 *
 * The real backend is not built yet. This class mimics the shape of a
 * WebSocket connection so the UI can be wired up against a stable interface.
 * When the Python backend lands, swap the body of `send()` / `connect()` for
 * a real `new WebSocket(...)` and keep the public API intact.
 */
export class DummyWebSocketClient {
  private listeners = new Set<Listener>();
  private status: ConnectionStatus = "disconnected";
  private statusListeners = new Set<(s: ConnectionStatus) => void>();
  private url: string;

  constructor(url = "ws://localhost:8000/cad") {
    this.url = url;
  }

  async connect(): Promise<void> {
    this.setStatus("connecting");
    await wait(400);
    this.setStatus("connected");
  }

  disconnect() {
    this.setStatus("disconnected");
    this.listeners.clear();
    this.statusListeners.clear();
  }

  get connectionStatus(): ConnectionStatus {
    return this.status;
  }

  get isConnected(): boolean {
    return this.status === "connected";
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatusChange(listener: (s: ConnectionStatus) => void): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  /**
   * Send a prompt to the (future) backend. Today it just acknowledges
   * receipt — actual AI work happens via the dummy backend in `app/dummy/ai`.
   */
  send(message: WebSocketMessage): void {
    if (!this.isConnected) {
      console.warn("[DummyWebSocket] not connected, dropping message", message);
      return;
    }
  }

  /** Test helper: push a message to all subscribers as if the server sent it. */
  emit(message: WebSocketMessage): void {
    for (const listener of this.listeners) listener(message);
  }

  private setStatus(status: ConnectionStatus) {
    this.status = status;
    for (const listener of this.statusListeners) listener(status);
  }

  get endpoint(): string {
    return this.url;
  }
}

export const wsClient = new DummyWebSocketClient();
