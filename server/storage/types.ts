import type { Topology } from "../renderer/topology";

export type PartType = "part" | "sheet-metal" | "assembly";

export type BackendName = "openscad" | "build123d";

export type RevisionSource = "chat" | "manual" | "import" | "fork";

export interface PartMeta {
  id: string;
  name: string;
  type: PartType;
  language: BackendName;
  createdAt: number;
  updatedAt: number;
  headRevId: string | null;
}

export interface PartSummary {
  id: string;
  name: string;
  type: PartType;
  language: BackendName;
  createdAt: number;
  updatedAt: number;
  headRevId: string | null;
}

export interface RevisionRecord {
  revId: string;
  parentRevId: string | null;
  code: string;
  language: BackendName;
  createdAt: number;
  source: RevisionSource;
  message: string | null;
  meshBlobId: string | null;
  label: string | null;
}

export type RevisionSummary = Omit<RevisionRecord, "code">;

export interface MessageRecord {
  msgId: string;
  parentMsgId: string | null;
  role: "user" | "assistant";
  partsJson: string;
  createdAt: number;
  producedRevId: string | null;
}

export interface StoredMesh {
  triangleCount: number;
  positions: Buffer;
  topology: Topology | null;
}

export interface SheetMetalMeta {
  thickness?: number;
  kFactor?: number;
  bends?: unknown[];
  flatPatternMeshBlobId?: string | null;
}

export interface AssemblyInstance {
  partId: string;
  translate: [number, number, number];
  rotate: [number, number, number];
}

export interface AssemblyManifest {
  instances: AssemblyInstance[];
}
