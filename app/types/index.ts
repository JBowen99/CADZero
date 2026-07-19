export type BackendName = "openscad" | "build123d";

export type ExportFormat = "stl" | "obj" | "3mf" | "step";

export type FaceExportFormat = "svg" | "dxf";

export type MessageRole = "user" | "assistant";

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

export type ChatMode = "plan" | "chat" | "build";

export interface TriangleMesh {
  positions: Float32Array;
  triangleCount: number;
}

export interface FaceGroup {
  id: string;
  startTri: number;
  endTri: number;
  normal: [number, number, number];
  area: number;
  center: [number, number, number];
}

export interface EdgeGroup {
  id: string;
  positions: number[];
  length: number;
  adjacentFaceIds: string[];
}

export interface VertexNode {
  id: string;
  position: [number, number, number];
  adjacentEdgeIds: string[];
  adjacentFaceIds: string[];
}

export interface Topology {
  faces: FaceGroup[];
  edges: EdgeGroup[];
  vertices: VertexNode[];
}

export type SelectionKind = "face" | "edge" | "vertex";

export interface TopologySelection {
  kind: SelectionKind;
  id: string;
  label: string;
  summary: string;
}

/** Persisted on UIMessage.metadata so chat history can show selection context. */
export interface ChatMessageMetadata {
  selection?: TopologySelection[];
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
  format: ExportFormat | FaceExportFormat;
  sizeBytes: number;
  filename: string;
}

export interface ModelingBackend {
  create(prompt: string): Promise<BackendResult>;
  modify(prompt: string): Promise<BackendResult>;
  render(): TriangleMesh | null;
  export(format: ExportFormat): Promise<ExportResult>;
}

export type PartType = "part" | "sheet-metal" | "assembly";

export type RevisionSource = "chat" | "manual" | "import" | "fork";

export interface PartSummary {
  id: string;
  name: string;
  type: PartType;
  language: BackendName;
  createdAt: number;
  updatedAt: number;
  headRevId: string | null;
}

export interface RevisionDTO {
  revId: string;
  parentRevId: string | null;
  language: BackendName;
  createdAt: number;
  source: RevisionSource;
  message: string | null;
  meshBlobId: string | null;
  label: string | null;
}

export type RevisionDetail = RevisionDTO & { code: string };

export interface StoredMessage {
  msgId: string;
  role: "user" | "assistant";
  partsJson: string;
  createdAt: number;
  producedRevId: string | null;
}

export interface WorkspaceInfo {
  root: string | null;
  configured: boolean;
  parts: PartSummary[];
}

export interface AppSettings {
  model?: string | null;
  defaultBackend?: BackendName;
  panelSplit?: number;
  viewMode?: string;
  gridVisible?: boolean;
  gizmoVisible?: boolean;
  lastOpenDocIds?: string[];
}

export interface PartDocument {
  meta: PartSummary;
  code: string | null;
  language: BackendName;
  headRevId: string | null;
  meshBlobId: string | null;
}

export interface CreatePartRequest {
  name?: string;
  type?: PartType;
  language?: BackendName;
}
