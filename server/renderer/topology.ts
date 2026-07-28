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
