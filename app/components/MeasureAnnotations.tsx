import { useEffect, useMemo } from "react";
import { Html, Line } from "@react-three/drei";
import * as THREE from "three";
import type {
  MeasurePick,
  MeasureResult,
  Topology,
  Vec3,
} from "~/types";

const MEASURE_COLOR = "#22d3ee"; // cyan-400 — distinct from amber selection
const MEASURE_VERTEX_BG = "#06b6d4";

/**
 * Ref callback that forces an object to render on top of everything else.
 * Disables depth testing + depth writing and sets a high render order so
 * dimension lines and highlights are never occluded by the solid mesh.
 */
function onTopRef(obj: THREE.Object3D | null): void {
  if (!obj) return;
  obj.renderOrder = 999;
  const mat = (obj as THREE.Mesh).material as THREE.Material | undefined;
  if (mat) {
    mat.depthTest = false;
    mat.depthWrite = false;
  }
}

function edgePolyline(positions: number[]): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < positions.length; i += 3) {
    pts.push([positions[i], positions[i + 1], positions[i + 2]]);
  }
  return pts;
}

function FaceOverlay({
  geometry,
  startTri,
  endTri,
}: {
  geometry: THREE.BufferGeometry;
  startTri: number;
  endTri: number;
}) {
  const geo = useMemo(() => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const sliced = arr.slice(startTri * 9, endTri * 9);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sliced, 3));
    return g;
  }, [geometry, startTri, endTri]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh ref={onTopRef} geometry={geo}>
      <meshBasicMaterial
        color={MEASURE_COLOR}
        transparent
        opacity={0.32}
        side={THREE.DoubleSide}
        depthTest={false}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function Vec3ToTuple(v: Vec3): [number, number, number] {
  return [v[0], v[1], v[2]];
}

function midpoint(a: Vec3, b: Vec3): [number, number, number] {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

function fmtSigned(n: number): string {
  const r = Math.abs(n) < 0.05 ? 0 : n;
  const sign = r >= 0 ? "+" : "−";
  return `${sign}${Math.abs(r).toFixed(2)}`;
}

function PairLabel({
  pair,
}: {
  pair: Extract<MeasureResult, { kind: "pair" }>["pair"];
}) {
  const a = pair.closestA;
  const b = pair.closestB;
  const mid = midpoint(a, b);
  const dx = pair.delta[0];
  const dy = pair.delta[1];
  const dz = pair.delta[2];
  return (
    <>
      <Line
        ref={onTopRef}
        points={[Vec3ToTuple(a), Vec3ToTuple(b)]}
        color={MEASURE_COLOR}
        lineWidth={2}
        dashed
        dashSize={2}
        gapSize={1.2}
      />
      <Html position={mid} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
        <div className="flex flex-col items-center gap-0.5 rounded-md border border-cyan-500/60 bg-background/95 px-2 py-1 text-[11px] font-medium leading-tight text-foreground shadow-md">
          <div className="tabular-nums text-cyan-600 dark:text-cyan-400">
            {pair.distance.toFixed(3)} mm
          </div>
          <div className="flex gap-1.5 font-mono text-[10px] text-muted-foreground tabular-nums">
            <span>Δx {fmtSigned(dx)}</span>
            <span>Δy {fmtSigned(dy)}</span>
            <span>Δz {fmtSigned(dz)}</span>
          </div>
          {pair.angleDeg !== undefined && (
            <div className="font-mono text-[10px] text-foreground tabular-nums">
              ∠ {pair.angleDeg.toFixed(2)}°
              {pair.parallel ? " · parallel" : ""}
            </div>
          )}
        </div>
      </Html>
    </>
  );
}

function VertexDot({
  position,
  fill,
}: {
  position: Vec3;
  fill: boolean;
}) {
  return (
    <Html position={Vec3ToTuple(position)} center zIndexRange={[40, 0]} style={{ pointerEvents: "none" }}>
      <div
        className={
          fill
            ? "size-2.5 rounded-full ring-2"
            : "size-2.5 rounded-full border-2"
        }
        style={{
          backgroundColor: fill ? MEASURE_VERTEX_BG : "transparent",
          borderColor: MEASURE_COLOR,
          // @ts-expect-error CSS custom prop for ring color
          "--tw-ring-color": MEASURE_COLOR,
        }}
      />
    </Html>
  );
}

export function MeasureAnnotations({
  geometry,
  topology,
  picks,
  results,
}: {
  geometry: THREE.BufferGeometry;
  topology: Topology;
  picks: MeasurePick[];
  results: MeasureResult[];
}) {
  const pickedFaceIds = new Set(
    picks.filter((p) => p.kind === "face").map((p) => p.id),
  );
  const pickedEdgeIds = new Set(
    picks.filter((p) => p.kind === "edge").map((p) => p.id),
  );
  const pickedVertexIds = new Set(
    picks.filter((p) => p.kind === "vertex").map((p) => p.id),
  );

  return (
    <group>
      {/* Picked entity highlights (cyan) */}
      {topology.faces
        .filter((f) => pickedFaceIds.has(f.id))
        .map((f) => (
          <FaceOverlay
            key={`mf-${f.id}`}
            geometry={geometry}
            startTri={f.startTri}
            endTri={f.endTri}
          />
        ))}

      {topology.edges
        .filter((e) => pickedEdgeIds.has(e.id))
        .map((e) => (
          <Line
            key={`me-${e.id}`}
            ref={onTopRef}
            points={edgePolyline(e.positions)}
            color={MEASURE_COLOR}
            lineWidth={4}
          />
        ))}

      {topology.vertices
        .filter((v) => pickedVertexIds.has(v.id))
        .map((v) => (
          <VertexDot key={`mv-${v.id}`} position={v.position} fill />
        ))}

      {/* Pair dimension lines + labels */}
      {results.map((r, i) =>
        r.kind === "pair" ? (
          <PairLabel key={`mr-${i}`} pair={r.pair} />
        ) : null,
      )}
    </group>
  );
}
