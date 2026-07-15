export type BackendName = "openscad" | "build123d";

export type ExportFormat = "stl" | "obj" | "3mf";

export type MessageRole = "user" | "assistant";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type ChatMode = "plan" | "chat" | "build";

export interface TriangleMesh {
  positions: number[];
  triangleCount: number;
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: number;
  cadCode?: string;
  language?: BackendName;
}

export interface BackendResult {
  message: string;
  cadCode: string;
  language: BackendName;
  mesh: TriangleMesh | null;
}

export interface ExportResult {
  format: ExportFormat;
  sizeBytes: number;
  filename: string;
}

export interface ModelingBackend {
  create(prompt: string): Promise<BackendResult>;
  modify(prompt: string): Promise<BackendResult>;
  render(): TriangleMesh | null;
  export(format: ExportFormat): Promise<ExportResult>;
}
