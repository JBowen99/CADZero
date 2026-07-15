export type BackendName = "openscad" | "build123d";

export type ExportFormat = "stl" | "obj" | "3mf";

export type MessageRole = "user" | "assistant";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type MeshKind = "box" | "cylinder" | "sphere" | "plate";

export interface Hole {
  position: [number, number, number];
  radius: number;
}

export interface MeshDescriptor {
  kind: MeshKind;
  size?: [number, number, number];
  radius?: number;
  height?: number;
  color: string;
  holes?: Hole[];
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
  mesh: MeshDescriptor | null;
}

export interface ExportResult {
  format: ExportFormat;
  sizeBytes: number;
  filename: string;
}

export interface ModelingBackend {
  create(prompt: string): Promise<BackendResult>;
  modify(prompt: string): Promise<BackendResult>;
  render(): MeshDescriptor | null;
  export(format: ExportFormat): Promise<ExportResult>;
}
