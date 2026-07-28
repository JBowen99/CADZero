import type {
  FaceGroup,
  EdgeGroup,
  MeasureMode,
  MeasurePick,
  MeasureResult,
  Topology,
  VertexNode,
} from "~/types";

/**
 * Client-side measurement computation — produces instant results from the
 * already-loaded topology data, avoiding a server round-trip.
 *
 * Handles:
 * - Single face: area, normal, center (from FaceGroup)
 * - Single edge: length, endpoints (from EdgeGroup.positions)
 * - Single vertex: position (from VertexNode.position)
 * - Vertex–vertex pair: Euclidean distance + dx/dy/dz
 *
 * Returns null for anything that needs B-rep queries (face perimeter, arc
 * radius, vertex–edge/face, edge–edge, face–face min distance) — those fall
 * through to the server dispatch.
 */
export function computeClientSide(
  picks: MeasurePick[],
  mode: MeasureMode,
  topology: Topology | null,
): MeasureResult[] | null {
  if (!topology || picks.length === 0) return null;

  const findFace = (id: string) => topology.faces.find((f) => f.id === id);
  const findEdge = (id: string) => topology.edges.find((e) => e.id === id);
  const findVertex = (id: string) => topology.vertices.find((v) => v.id === id);

  function single(pick: MeasurePick): MeasureResult | null {
    if (pick.kind === "face") {
      const f = findFace(pick.id);
      if (!f) return null;
      return {
        kind: "single",
        entity: {
          kind: "face",
          id: f.id,
          area: f.area,
          normal: f.normal,
          center: f.center,
        },
      };
    }
    if (pick.kind === "edge") {
      const e = findEdge(pick.id);
      if (!e) return null;
      const p = e.positions;
      const start: [number, number, number] = [p[0], p[1], p[2]];
      const tail = p.length - 3;
      const end: [number, number, number] = [p[tail], p[tail + 1], p[tail + 2]];
      return {
        kind: "single",
        entity: {
          kind: "edge",
          id: e.id,
          length: e.length,
          endpoints: [start, end],
        },
      };
    }
    // vertex
    const v = findVertex(pick.id);
    if (!v) return null;
    return {
      kind: "single",
      entity: {
        kind: "vertex",
        id: v.id,
        position: v.position,
      },
    };
  }

  function vertexVertex(
    a: VertexNode,
    b: VertexNode,
  ): MeasureResult {
    const dx = b.position[0] - a.position[0];
    const dy = b.position[1] - a.position[1];
    const dz = b.position[2] - a.position[2];
    return {
      kind: "pair",
      pair: {
        a: { kind: "vertex", id: a.id },
        b: { kind: "vertex", id: b.id },
        distance: Math.sqrt(dx * dx + dy * dy + dz * dz),
        delta: [
          Math.round(dx * 1e6) / 1e6,
          Math.round(dy * 1e6) / 1e6,
          Math.round(dz * 1e6) / 1e6,
        ],
        closestA: a.position,
        closestB: b.position,
      },
    };
  }

  // Single mode — all client-side
  if (mode === "single") {
    const results = picks.map(single).filter((r): r is MeasureResult => r !== null);
    return results.length > 0 ? results : null;
  }

  // Pair mode
  if (mode === "pair") {
    if (picks.length < 2) {
      const r = single(picks[0]);
      return r ? [r] : null;
    }
    const a = picks[picks.length - 2];
    const b = picks[picks.length - 1];
    // Vertex–vertex: instant Euclidean distance
    if (a.kind === "vertex" && b.kind === "vertex") {
      const va = findVertex(a.id);
      const vb = findVertex(b.id);
      if (va && vb) return [vertexVertex(va, vb)];
    }
    // All other pairs need the server (BRepExtrema)
    return null;
  }

  // Chain mode — entity-type aware:
  //   All vertices → pair distances between consecutive picks
  //   All edges    → single length per edge
  //   All faces    → single area per face
  //   Mixed        → single per pick (each entity's primary dimension)
  if (mode === "chain") {
    if (picks.length === 1) {
      const r = single(picks[0]);
      return r ? [r] : null;
    }

    const allVertices = picks.every((p) => p.kind === "vertex");

    if (allVertices) {
      // Consecutive vertex-vertex pair distances
      const results: MeasureResult[] = [];
      for (let i = 0; i < picks.length - 1; i++) {
        const va = findVertex(picks[i].id);
        const vb = findVertex(picks[i + 1].id);
        if (va && vb) {
          results.push(vertexVertex(va, vb));
        } else {
          return null; // entity not found — fall through to server
        }
      }
      return results.length > 0 ? results : null;
    }

    // Edges, faces, or mixed → single measurement per pick
    const results = picks.map(single).filter((r): r is MeasureResult => r !== null);
    return results.length > 0 ? results : null;
  }

  return null;
}

/**
 * Returns true if the measurement requires a server round-trip
 * (i.e. `computeClientSide` returned null).
 */
export function canComputeClientSide(
  picks: MeasurePick[],
  mode: MeasureMode,
  topology: Topology | null,
): boolean {
  return computeClientSide(picks, mode, topology) !== null;
}
