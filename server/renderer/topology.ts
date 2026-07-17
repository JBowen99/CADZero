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
