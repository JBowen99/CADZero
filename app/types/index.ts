export type BackendName = "openscad" | "build123d";

export type ExportFormat = "stl" | "obj" | "3mf" | "step";

export type ViewMode = "solid" | "shaded" | "wireframe";

export interface LightingSettings {
  ambientIntensity: number;
  directionalIntensity: number;
  azimuth: number;
  elevation: number;
  roughness: number;
  metalness: number;
  rimLight: boolean;
  rimIntensity: number;
}

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

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

export type MeasureKind = "face" | "edge" | "vertex";

export type MeasureMode = "single" | "pair" | "chain";

/** Entity reference resolved by the picker (id matches a Topology entry). */
export interface MeasurePick {
  kind: MeasureKind;
  id: string;
}

export type Vec3 = [number, number, number];

/** Single-entity properties (face / edge / vertex). */
export interface MeasureEntity {
  kind: MeasureKind;
  id: string;
  /** Face area (mm²). */
  area?: number;
  /** Edge length or face perimeter (mm). */
  length?: number;
  perimeter?: number;
  /** Radius if the edge is an arc or the face is spherical/cylindrical, else null. */
  radius?: number | null;
  /** Face normal (unit). */
  normal?: Vec3;
  /** Centroid (face/arc) or vertex position. */
  center?: Vec3;
  position?: Vec3;
  /** Edge endpoints (straight/arc edges). */
  endpoints?: [Vec3, Vec3];
  /** True when the edge is a circular arc. */
  isArc?: boolean;
}

/** Pairwise measurement between two entities. */
export interface MeasurePair {
  a: MeasurePick;
  b: MeasurePick;
  /** Minimum direct distance between the two entities (mm). */
  distance: number;
  /** Signed dx/dy/dz between the two closest points (B - A). */
  delta: Vec3;
  closestA: Vec3;
  closestB: Vec3;
  /** Angle (degrees) for face-face (dihedral) and edge-edge pairs; absent otherwise. */
  angleDeg?: number;
  /** True when the two faces/edges are parallel. */
  parallel?: boolean;
}

export type MeasureResult =
  | { kind: "single"; entity: MeasureEntity }
  | { kind: "pair"; pair: MeasurePair };

/** Persisted on UIMessage.metadata so chat history can show selection + measurement context. */
export interface ChatMessageMetadata {
  selection?: TopologySelection[];
  measurements?: MeasureResult[];
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
  parametric?: boolean;
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
  viewMode?: ViewMode;
  lighting?: LightingSettings;
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
  parametric?: boolean;
}

// ---------------------------------------------------------------------------
// Parametric model metadata (OpenSCAD Customizer convention + @op markers)
// ---------------------------------------------------------------------------

export type ParamType = "number" | "string" | "bool" | "choice";

export interface ParamDef {
  name: string;
  value: number | string | boolean;
  type: ParamType;
  public: boolean;
  group?: string;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  desc?: string;
  line: number;
}

export type OpKind =
  | "sketch"
  | "extrude"
  | "cut"
  | "revolve"
  | "fillet"
  | "chamfer"
  | "pattern"
  | "shell"
  | "hole"
  | "offset"
  | "hull"
  | "union"
  | "intersection"
  | "mirror"
  | "rotate"
  | "translate"
  | "scale"
  | "final"
  | "other";

export interface OpNode {
  id: string;
  kind: OpKind;
  rawKind: string;
  name: string;
  order: number;
  line: number;
}

export interface ModelMeta {
  params: ParamDef[];
  ops: OpNode[];
}
