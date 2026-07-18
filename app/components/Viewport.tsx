import {
  Suspense,
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  Grid,
  Html,
  Line,
  OrbitControls,
  useBounds,
} from "@react-three/drei";
import { useTheme } from "next-themes";
import { ArrowLeft, Axis3d, Box, CircleDot, Compass, Crosshair, Disc, FilePlus2, FolderOpen, Grid2x2, Grid3x3, Loader2, Maximize2, RotateCcw, Slash, Square, Target, TriangleAlert } from "lucide-react";
import * as THREE from "three";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { RubiksGizmo } from "~/components/RubiksGizmo";
import { SelectionIndicator } from "~/components/SelectionIndicator";
import { PartsBrowser } from "~/components/PartsBrowser";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import { useModelStore } from "~/store/useModelStore";
import { useDocumentsStore } from "~/store/useDocumentsStore";
import { useSelectionStore } from "~/store/useSelectionStore";
import { useRestoreWithNote } from "~/lib/useRestoreWithNote";
import { buildMesh } from "~/lib/mesh-worker-client";
import type { BackendName, FaceGroup, Topology, TopologySelection } from "~/types";

const OPENSCAD_UP_ROTATION: [number, number, number] = [-Math.PI / 2, 0, 0];
const IDENTITY_ROTATION: [number, number, number] = [0, 0, 0];

interface FitRef {
  current: (() => void) | null;
}

interface InteractionRef {
  current: boolean;
}

interface GridColors {
  cell: string;
  section: string;
}

type ViewMode = "shaded" | "solid" | "wireframe";
type SelectMode = "off" | "all" | "precise";
type SelectKind = "face" | "edge" | "vertex";

const VIEW_MODES: { value: ViewMode; label: string; icon: typeof Box }[] = [
  { value: "shaded", label: "Shaded", icon: Disc },
  { value: "solid", label: "Solid", icon: Box },
  { value: "wireframe", label: "Wireframe", icon: Grid3x3 },
];

const PRECISE_KINDS: { value: SelectKind; label: string; icon: typeof Box }[] = [
  { value: "face", label: "Select faces", icon: Square },
  { value: "edge", label: "Select edges", icon: Slash },
  { value: "vertex", label: "Select vertices", icon: CircleDot },
];

interface HoverCandidate {
  kind: SelectKind;
  id: string;
}

function fmtVec(v: [number, number, number]): string {
  return `(${v[0].toFixed(1)}, ${v[1].toFixed(1)}, ${v[2].toFixed(1)})`;
}

function normalDirection(n: [number, number, number]): string {
  const axes: [string, number][] = [
    ["+X", n[0]],
    ["-X", -n[0]],
    ["+Y", n[1]],
    ["-Y", -n[1]],
    ["+Z", n[2]],
    ["-Z", -n[2]],
  ];
  axes.sort((a, b) => b[1] - a[1]);
  return axes[0][1] > 0.7 ? axes[0][0] : `~${axes[0][0]}`;
}

function faceSelection(face: FaceGroup): TopologySelection {
  return {
    kind: "face",
    id: face.id,
    label: `Face ${face.id}`,
    summary: `normal ${normalDirection(face.normal)} · ${face.area.toFixed(0)} mm² · center ${fmtVec(face.center)}`,
  };
}

function edgeSelection(edge: Topology["edges"][number]): TopologySelection {
  return {
    kind: "edge",
    id: edge.id,
    label: `Edge ${edge.id}`,
    summary: `${edge.length.toFixed(1)} mm`,
  };
}

function vertexSelection(vertex: Topology["vertices"][number]): TopologySelection {
  return {
    kind: "vertex",
    id: vertex.id,
    label: `Vertex ${vertex.id}`,
    summary: `at ${fmtVec(vertex.position)}`,
  };
}

// Front-right-top viewing direction (matches the default camera at [140,110,160]).
const FRONT_RIGHT_TOP_DIR = new THREE.Vector3(140, 110, 160).normalize();

// World-space axis colors (match the RubiksGizmo face-center cubies).
const AXIS_X = "#ef4444"; // red  (+X right)
const AXIS_Y = "#22c55e"; // green (+Y up)
const AXIS_Z = "#3b82f6"; // blue (+Z toward viewer)
const AXIS_LENGTH = 500;

function FitController({
  geometry,
  fitRef,
  frameRef,
  interactingRef,
}: {
  geometry: THREE.BufferGeometry | null;
  fitRef: FitRef;
  frameRef: FitRef;
  interactingRef: InteractionRef;
}) {
  const api = useBounds();

  // Fit while preserving the current camera angle (used for auto-fit on new mesh).
  const doFit = () => {
    api.refresh();
    api.reset().fit();
    api.clip();
  };

  // Reorient to the front-right-top corner, then fit (used by the Frame button).
  const doFrame = () => {
    api.refresh();
    const { center, distance } = api.getSize();
    api.moveTo(center.clone().addScaledVector(FRONT_RIGHT_TOP_DIR, distance));
    api.lookAt({ target: center });
    api.clip();
  };

  useEffect(() => {
    fitRef.current = doFit;
    frameRef.current = doFrame;
    return () => {
      if (fitRef.current === doFit) fitRef.current = null;
      if (frameRef.current === doFrame) frameRef.current = null;
    };
  });

  useEffect(() => {
    if (!geometry) return;
    if (interactingRef.current) return;
    doFit();
  }, [geometry]);

  return null;
}

function AxisLine({
  dx,
  dy,
  dz,
  color,
  length,
}: {
  dx: number;
  dy: number;
  dz: number;
  color: string;
  length: number;
}) {
  const geometry = useMemo(() => {
    const positions = new Float32Array([
      -dx * length,
      -dy * length,
      -dz * length,
      dx * length,
      dy * length,
      dz * length,
    ]);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return g;
  }, [dx, dy, dz, length]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry}>
      <lineBasicMaterial color={color} toneMapped={false} />
    </lineSegments>
  );
}

function Axes({ length = AXIS_LENGTH }: { length?: number }) {
  return (
    <>
      <AxisLine dx={1} dy={0} dz={0} color={AXIS_X} length={length} />
      <AxisLine dx={0} dy={1} dz={0} color={AXIS_Y} length={length} />
      <AxisLine dx={0} dy={0} dz={1} color={AXIS_Z} length={length} />
    </>
  );
}

const HIGHLIGHT_COLOR = "#eab308";
const HOVER_COLOR = "#ffffff";
const VERTEX_RADIUS_PX = 12;
const EDGE_RADIUS_PX = 10;
const DRIFT_PX = 5;

function FaceHighlight({
  geometry,
  face,
  color,
  opacity,
}: {
  geometry: THREE.BufferGeometry;
  face: FaceGroup;
  color: string;
  opacity: number;
}) {
  const geo = useMemo(() => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const start = face.startTri * 9;
    const end = face.endTri * 9;
    const sliced = arr.slice(start, end);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sliced, 3));
    return g;
  }, [geometry, face.startTri, face.endTri]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color={color}
        transparent
        opacity={opacity}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function edgePoints(edge: Topology["edges"][number]): [number, number, number][] {
  const pts: [number, number, number][] = [];
  for (let i = 0; i < edge.positions.length; i += 3) {
    pts.push([edge.positions[i], edge.positions[i + 1], edge.positions[i + 2]]);
  }
  return pts;
}

function SelectionLayers({
  geometry,
  topology,
  selection,
  hovered,
  meshRef,
}: {
  geometry: THREE.BufferGeometry;
  topology: Topology;
  selection: TopologySelection[];
  hovered: HoverCandidate | null;
  meshRef: React.RefObject<THREE.Mesh | null>;
}) {
  const occluders = useMemo(
    () => [meshRef] as unknown as React.RefObject<THREE.Object3D>[],
    [meshRef],
  );
  const isSel = (kind: SelectKind, id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);

  const hoveredFace =
    hovered?.kind === "face"
      ? topology.faces.find((f) => f.id === hovered.id) ?? null
      : null;
  const hoveredEdge =
    hovered?.kind === "edge"
      ? topology.edges.find((e) => e.id === hovered.id) ?? null
      : null;
  const hoveredVertex =
    hovered?.kind === "vertex"
      ? topology.vertices.find((v) => v.id === hovered.id) ?? null
      : null;

  return (
    <group>
      {selection
        .filter((s) => s.kind === "face")
        .map((s) => {
          const f = topology.faces.find((x) => x.id === s.id);
          return f ? (
            <FaceHighlight
              key={`sf-${s.id}`}
              geometry={geometry}
              face={f}
              color={HIGHLIGHT_COLOR}
              opacity={0.5}
            />
          ) : null;
        })}
      {hoveredFace && !isSel("face", hoveredFace.id) && (
        <FaceHighlight
          geometry={geometry}
          face={hoveredFace}
          color={HOVER_COLOR}
          opacity={0.35}
        />
      )}

      {selection
        .filter((s) => s.kind === "edge")
        .map((s) => {
          const e = topology.edges.find((x) => x.id === s.id);
          return e ? (
            <Line
              key={`se-${s.id}`}
              points={edgePoints(e)}
              color={HIGHLIGHT_COLOR}
              lineWidth={4}
            />
          ) : null;
        })}
      {hoveredEdge && !isSel("edge", hoveredEdge.id) && (
        <Line
          points={edgePoints(hoveredEdge)}
          color={HOVER_COLOR}
          lineWidth={3}
          transparent
          opacity={0.85}
        />
      )}

      {selection
        .filter((s) => s.kind === "vertex")
        .map((s) => {
          const v = topology.vertices.find((x) => x.id === s.id);
          return v ? (
            <Html
              key={`sv-${s.id}`}
              position={v.position}
              center
              occlude={occluders}
              style={{ pointerEvents: "none" }}
              zIndexRange={[20, 0]}
            >
              <div className="size-2.5 rounded-full bg-amber-500 ring-2 ring-amber-500" />
            </Html>
          ) : null;
        })}
      {hoveredVertex && !isSel("vertex", hoveredVertex.id) && (
        <Html
          position={hoveredVertex.position}
          center
          occlude={occluders}
          style={{ pointerEvents: "none" }}
          zIndexRange={[20, 0]}
        >
          <div className="size-2.5 rounded-full border-2 border-white bg-transparent" />
        </Html>
      )}
    </group>
  );
}

function SelectionPicker({
  meshRef,
  geometry,
  topology,
  selectMode,
  preciseKind,
  selection,
  onToggle,
}: {
  meshRef: React.RefObject<THREE.Mesh | null>;
  geometry: THREE.BufferGeometry;
  topology: Topology;
  selectMode: SelectMode;
  preciseKind: SelectKind;
  selection: TopologySelection[];
  onToggle: (sel: TopologySelection) => void;
}) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const [hovered, setHovered] = useState<HoverCandidate | null>(null);
  const hoveredRef = useRef<HoverCandidate | null>(null);
  const cursorRef = useRef<{ x: number; y: number; valid: boolean }>({
    x: 0,
    y: 0,
    valid: false,
  });
  const downRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tmpVec = useMemo(() => new THREE.Vector3(), []);
  const ndcVec = useMemo(() => new THREE.Vector2(), []);
  const dirVec = useMemo(() => new THREE.Vector3(), []);

  hoveredRef.current = hovered;
  const onToggleRef = useRef(onToggle);
  onToggleRef.current = onToggle;
  const inputsRef = useRef({ topology, selectMode, preciseKind });
  inputsRef.current = { topology, selectMode, preciseKind };

  useEffect(() => {
    setHovered(null);
  }, [topology, selectMode, preciseKind]);

  useEffect(() => {
    const el = gl.domElement;

    const projectToScreen = (
      world: [number, number, number],
      rect: DOMRect,
    ): { x: number; y: number; z: number } => {
      tmpVec.set(world[0], world[1], world[2]).project(camera);
      return {
        x: (tmpVec.x * 0.5 + 0.5) * rect.width,
        y: (-tmpVec.y * 0.5 + 0.5) * rect.height,
        z: tmpVec.z,
      };
    };

    const occluded = (world: [number, number, number]): boolean => {
      const mesh = meshRef.current;
      if (!mesh) return false;
      tmpVec.set(world[0], world[1], world[2]);
      const dist = camera.position.distanceTo(tmpVec);
      dirVec.copy(tmpVec).sub(camera.position).normalize();
      raycaster.set(camera.position, dirVec);
      const hits = raycaster.intersectObject(mesh, false);
      return hits.length > 0 && hits[0].distance < dist - 0.01;
    };

    const compute = () => {
      const { topology, selectMode, preciseKind } = inputsRef.current;
      const cur = cursorRef.current;
      if (selectMode === "off" || !cur.valid) {
        setHovered(null);
        return;
      }
      const rect = el.getBoundingClientRect();
      const kinds: SelectKind[] =
        selectMode === "all" ? ["vertex", "edge", "face"] : [preciseKind];
      let cand: HoverCandidate | null = null;

      if (kinds.includes("vertex")) {
        let bestId: string | null = null;
        let bestPos: [number, number, number] | null = null;
        let bestD = VERTEX_RADIUS_PX;
        for (const v of topology.vertices) {
          const sp = projectToScreen(v.position, rect);
          if (sp.z < -1 || sp.z > 1) continue;
          const d = Math.hypot(sp.x - cur.x, sp.y - cur.y);
          if (d < bestD) {
            bestD = d;
            bestId = v.id;
            bestPos = v.position;
          }
        }
        if (bestId && bestPos && !occluded(bestPos)) {
          cand = { kind: "vertex", id: bestId };
        }
      }

      if (!cand && kinds.includes("edge")) {
        let bestId: string | null = null;
        let bestA: [number, number, number] | null = null;
        let bestB: [number, number, number] | null = null;
        let bestT = 0;
        let bestD = EDGE_RADIUS_PX;
        for (const e of topology.edges) {
          let prevScreen: { x: number; y: number } | null = null;
          let prevWorld: [number, number, number] | null = null;
          for (let i = 0; i < e.positions.length; i += 3) {
            const w: [number, number, number] = [
              e.positions[i],
              e.positions[i + 1],
              e.positions[i + 2],
            ];
            const sp = projectToScreen(w, rect);
            if (sp.z < -1 || sp.z > 1) {
              prevScreen = null;
              prevWorld = null;
              continue;
            }
            if (prevScreen && prevWorld) {
              const dx = sp.x - prevScreen.x;
              const dy = sp.y - prevScreen.y;
              const denom = dx * dx + dy * dy;
              const t =
                denom > 1e-6
                  ? Math.max(
                      0,
                      Math.min(
                        1,
                        ((cur.x - prevScreen.x) * dx +
                          (cur.y - prevScreen.y) * dy) /
                          denom,
                      ),
                    )
                  : 0;
              const px = prevScreen.x + t * dx;
              const py = prevScreen.y + t * dy;
              const d = Math.hypot(px - cur.x, py - cur.y);
              if (d < bestD) {
                bestD = d;
                bestId = e.id;
                bestA = prevWorld;
                bestB = w;
                bestT = t;
              }
            }
            prevScreen = { x: sp.x, y: sp.y };
            prevWorld = w;
          }
        }
        if (bestId && bestA && bestB) {
          const world: [number, number, number] = [
            bestA[0] + bestT * (bestB[0] - bestA[0]),
            bestA[1] + bestT * (bestB[1] - bestA[1]),
            bestA[2] + bestT * (bestB[2] - bestA[2]),
          ];
          if (!occluded(world)) cand = { kind: "edge", id: bestId };
        }
      }

      if (!cand && kinds.includes("face")) {
        const mesh = meshRef.current;
        if (mesh) {
          ndcVec.set((cur.x / rect.width) * 2 - 1, -(cur.y / rect.height) * 2 + 1);
          raycaster.setFromCamera(ndcVec, camera);
          const hits = raycaster.intersectObject(mesh, false);
          if (hits.length > 0 && hits[0].faceIndex != null) {
            const fi = hits[0].faceIndex;
            const face = topology.faces.find(
              (f) => fi >= f.startTri && fi < f.endTri,
            );
            if (face) cand = { kind: "face", id: face.id };
          }
        }
      }

      setHovered((prev) =>
        prev && cand && prev.kind === cand.kind && prev.id === cand.id
          ? prev
          : cand,
      );
    };

    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      cursorRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        valid: true,
      };
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        compute();
      });
    };
    const onDown = (e: PointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY };
    };
    const onUp = (e: PointerEvent) => {
      const dp = downRef.current;
      downRef.current = null;
      if (!dp) return;
      if (Math.hypot(e.clientX - dp.x, e.clientY - dp.y) > DRIFT_PX) return;
      const cur = hoveredRef.current;
      if (!cur) return;
      const { topology } = inputsRef.current;
      let sel: TopologySelection | null = null;
      if (cur.kind === "face") {
        const f = topology.faces.find((x) => x.id === cur.id);
        if (f) sel = faceSelection(f);
      } else if (cur.kind === "edge") {
        const ed = topology.edges.find((x) => x.id === cur.id);
        if (ed) sel = edgeSelection(ed);
      } else {
        const v = topology.vertices.find((x) => x.id === cur.id);
        if (v) sel = vertexSelection(v);
      }
      if (sel) onToggleRef.current(sel);
    };
    const onLeave = () => {
      cursorRef.current.valid = false;
      setHovered(null);
    };

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerdown", onDown);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointerleave", onLeave);
    return () => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerdown", onDown);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointerleave", onLeave);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    };
  }, [gl, camera, raycaster, tmpVec, ndcVec, dirVec]);

  return (
    <SelectionLayers
      geometry={geometry}
      topology={topology}
      selection={selection}
      hovered={hovered}
      meshRef={meshRef}
    />
  );
}

function Scene({
  geometry,
  edgePositions,
  fitRef,
  frameRef,
  gridColors,
  edgeColor,
  interactingRef,
  viewMode,
  showGrid,
  showGizmo,
  showAxes,
  language,
  topology,
  selectMode,
  preciseKind,
  selection,
  onToggleSelection,
}: {
  geometry: THREE.BufferGeometry | null;
  edgePositions: Float32Array | null;
  fitRef: FitRef;
  frameRef: FitRef;
  gridColors: GridColors | null;
  edgeColor: string | null;
  interactingRef: InteractionRef;
  viewMode: ViewMode;
  showGrid: boolean;
  showGizmo: boolean;
  showAxes: boolean;
  language: BackendName;
  topology: Topology | null;
  selectMode: SelectMode;
  preciseKind: SelectKind;
  selection: TopologySelection[];
  onToggleSelection: (sel: TopologySelection) => void;
}) {
  const meshRef = useRef<THREE.Mesh | null>(null);
  const edgesRef = useRef<THREE.BufferGeometry | null>(null);
  const edges = useMemo(() => {
    edgesRef.current?.dispose();
    edgesRef.current = null;
    const showEdges = viewMode === "solid" || viewMode === "wireframe";
    if (!showEdges || !edgePositions || edgePositions.length === 0) return null;
    const e = new THREE.BufferGeometry();
    e.setAttribute("position", new THREE.BufferAttribute(edgePositions, 3));
    edgesRef.current = e;
    return e;
  }, [edgePositions, viewMode]);
  useEffect(() => () => edgesRef.current?.dispose(), []);

  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[80, 120, 60]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <directionalLight position={[-60, 40, -80]} intensity={0.3} />

      <Bounds margin={1.2}>
        <FitController
          geometry={geometry}
          fitRef={fitRef}
          frameRef={frameRef}
          interactingRef={interactingRef}
        />
        <Suspense fallback={null}>
          {geometry && (
            <group
              rotation={
                language === "build123d"
                  ? IDENTITY_ROTATION
                  : OPENSCAD_UP_ROTATION
              }
            >
              {viewMode !== "wireframe" && (
                <mesh
                  ref={meshRef}
                  geometry={geometry}
                  castShadow
                  receiveShadow
                >
                  <meshStandardMaterial
                    color="#d4d4d8"
                    metalness={0.1}
                    roughness={0.5}
                    polygonOffset={viewMode === "solid"}
                    polygonOffsetFactor={1}
                    polygonOffsetUnits={1}
                  />
                </mesh>
              )}
              {edges && (
                  <lineSegments geometry={edges}>
                    <lineBasicMaterial color={edgeColor ?? "#eab308"} />
                  </lineSegments>
              )}
              {geometry && topology && (
                <SelectionPicker
                  meshRef={meshRef}
                  geometry={geometry}
                  topology={topology}
                  selectMode={selectMode}
                  preciseKind={preciseKind}
                  selection={selection}
                  onToggle={onToggleSelection}
                />
              )}
            </group>
          )}
        </Suspense>
      </Bounds>

      {showAxes && <Axes />}

      {showGrid && (
        <Grid
          args={[400, 400]}
          cellSize={5}
          cellThickness={0.6}
          cellColor={gridColors?.cell ?? "#9ca3af"}
          sectionSize={50}
          sectionThickness={1.2}
          sectionColor={gridColors?.section ?? "#737373"}
          fadeDistance={320}
          fadeStrength={1}
          followCamera={false}
          infiniteGrid
        />
      )}

      {showGizmo && (
        <GizmoHelper alignment="bottom-right" margin={[72, 72]}>
          <RubiksGizmo />
        </GizmoHelper>
      )}

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={20}
        maxDistance={600}
        onStart={() => {
          interactingRef.current = true;
        }}
        onEnd={() => {
          interactingRef.current = false;
        }}
      />
    </>
  );
}

function resolveTokenColor(token: string): string | null {
  if (typeof window === "undefined") return null;
  const probe = document.createElement("div");
  probe.style.color = token;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const computed = getComputedStyle(probe).color;
  probe.remove();
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx) return computed || null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = computed;
  const out = ctx.fillStyle;
  return out === "#010203" ? computed || null : out;
}

function EmptyHint() {
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
      <div className="rounded-md border border-dashed bg-background/70 px-4 py-3 text-center text-sm text-muted-foreground">
        No model yet.
        <br />
        Ask the assistant to create one.
      </div>
    </div>
  );
}

function NoTabsHint() {
  const setNewPartDialogOpen = useDocumentsStore(
    (s) => s.setNewPartDialogOpen,
  );
  const [browserOpen, setBrowserOpen] = useState(false);
  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-background/80 px-6 py-5 text-center">
          <span className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Box className="size-5 text-muted-foreground" />
          </span>
          <div className="space-y-0.5">
            <p className="text-sm font-medium">Open or create a new part</p>
            <p className="text-xs text-muted-foreground">
              Choose a backend, then start modeling.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setBrowserOpen(true)}
            >
              <FolderOpen className="size-3.5" />
              Open part
            </Button>
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => setNewPartDialogOpen(true)}
            >
              <FilePlus2 className="size-3.5" />
              New part
            </Button>
          </div>
        </div>
      </div>
      <PartsBrowser open={browserOpen} onOpenChange={setBrowserOpen} />
    </>
  );
}

export function Viewport() {
  const mesh = useModelStore((s) => s.mesh);
  const topology = useModelStore((s) => s.topology);
  const language = useModelStore((s) => s.language);
  const rendering = useModelStore((s) => s.isRendering);
  const building = useModelStore((s) => s.isBuilding);
  const selection = useSelectionStore((s) => s.selection);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const clearSelection = useSelectionStore((s) => s.clear);
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const exitPreview = useDocumentsStore((s) => s.exitPreview);
  const renderActiveCode = useDocumentsStore((s) => s.renderActiveCode);
  const openDocsLength = useDocumentsStore((s) => s.openDocs.length);
  const meshStale = useDocumentsStore((s) => {
    const d = s.openDocs.find((x) => x.clientId === s.activeClientId);
    return !!d?.mesh && d.cadCode !== (d.meshCode ?? "");
  });
  const restoreWithNote = useRestoreWithNote();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [edgePositions, setEdgePositions] = useState<Float32Array | null>(null);
  const [processing, setProcessing] = useState(false);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const interactingRef = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>("shaded");
  const [selectMode, setSelectMode] = useState<SelectMode>("off");
  const [preciseKind, setPreciseKind] = useState<SelectKind>("face");
  const [showGrid, setShowGrid] = useState(true);
  const [showGizmo, setShowGizmo] = useState(true);
  const [showAxes, setShowAxes] = useState(true);

  const { resolvedTheme } = useTheme();
  const [gridColors, setGridColors] = useState<GridColors | null>(null);
  const [edgeColor, setEdgeColor] = useState<string | null>(null);

  const canSelect = !!topology;

  useEffect(() => {
    if (!canSelect && selectMode !== "off") setSelectMode("off");
  }, [canSelect, selectMode]);

  useEffect(() => {
    clearSelection();
  }, [mesh, clearSelection]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectMode !== "off") setSelectMode("off");
        else clearSelection();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, clearSelection]);

  useEffect(() => {
    setGridColors({
      cell: resolveTokenColor("var(--color-border)") ?? "#9ca3af",
      section: resolveTokenColor("var(--color-muted-foreground)") ?? "#737373",
    });
    setEdgeColor(resolveTokenColor("var(--color-primary)"));
  }, [resolvedTheme]);

  useEffect(() => {
    if (!mesh) {
      geometryRef.current?.dispose();
      geometryRef.current = null;
      startTransition(() => {
        setGeometry(null);
        setEdgePositions(null);
        setProcessing(false);
      });
      return;
    }

    let cancelled = false;
    setProcessing(true);
    // Dedicated copy for worker transfer — store-owned buffer stays intact.
    const positions = new Float32Array(mesh.positions);

    buildMesh(positions)
      .then(({ positions: p, normals, edges, center, radius }) => {
        if (cancelled) return;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute("position", new THREE.BufferAttribute(p, 3));
        geo.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
        geo.boundingSphere = new THREE.Sphere(
          new THREE.Vector3(center[0], center[1], center[2]),
          radius,
        );
        geometryRef.current?.dispose();
        geometryRef.current = geo;
        startTransition(() => {
          setGeometry(geo);
          setEdgePositions(edges);
          setProcessing(false);
        });
      })
      .catch(() => {
        if (!cancelled) {
          startTransition(() => setProcessing(false));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [mesh]);

  useEffect(() => () => geometryRef.current?.dispose(), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "f" && e.key !== "F") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || t?.isContentEditable) return;
      e.preventDefault();
      frameRef.current?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="relative h-full w-full bg-background">
      <Canvas
        shadows
        camera={{ position: [140, 110, 160], fov: 45, near: 0.1, far: 2000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true, alpha: true }}
      >
        <Scene
          geometry={geometry}
          edgePositions={edgePositions}
          fitRef={fitRef}
          frameRef={frameRef}
          gridColors={gridColors}
          edgeColor={edgeColor}
          interactingRef={interactingRef}
          viewMode={viewMode}
          showGrid={showGrid}
          showGizmo={showGizmo}
          showAxes={showAxes}
          language={language}
          topology={topology}
          selectMode={selectMode}
          preciseKind={preciseKind}
          selection={selection}
          onToggleSelection={toggleSelection}
        />
      </Canvas>

      {openDocsLength === 0 ? (
        <NoTabsHint />
      ) : !mesh ? (
        <EmptyHint />
      ) : null}
      {previewingRevId && (
        <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-md border bg-background/90 px-2.5 py-1.5 text-xs shadow-sm">
          <span className="font-medium text-primary">
            Viewing older version
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => void exitPreview()}
          >
            <ArrowLeft className="size-3" />
            Current
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px]"
            onClick={() => void restoreWithNote(previewingRevId)}
          >
            <RotateCcw className="size-3" />
            Restore
          </Button>
        </div>
      )}
      {processing ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
          <Loader2 className="size-3.5 animate-spin" />
          Processing mesh…
        </div>
      ) : rendering || building ? (
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-1.5 rounded-md border bg-background/80 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
          <Loader2 className="size-3.5 animate-spin" />
          Rendering…
        </div>
      ) : mesh && meshStale ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => void renderActiveCode()}
              className="absolute left-3 top-3 flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-600 shadow-sm hover:bg-amber-500/20 dark:text-amber-400"
            >
              <TriangleAlert className="size-3.5" />
              Out of sync
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            The shown model doesn't match the current code. Click to render.
          </TooltipContent>
        </Tooltip>
      ) : null}
      <div className="absolute bottom-3 left-3 flex items-end gap-1.5">
        <div className="flex flex-col gap-1">
          {selectMode === "precise" && (
            <div className="flex items-center gap-0.5 self-end rounded-md border bg-background/80 p-0.5">
              {PRECISE_KINDS.map((m) => {
                const Icon = m.icon;
                const active = m.value === preciseKind;
                return (
                  <Tooltip key={m.value}>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={cn(
                          "h-7 w-7",
                          active && "bg-primary text-primary-foreground",
                        )}
                        onClick={() => setPreciseKind(m.value)}
                        aria-label={m.label}
                        aria-pressed={active}
                      >
                        <Icon className="size-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="top">{m.label}</TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-0.5 rounded-md border bg-background/80 p-0.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className={cn(
                    "h-7 w-7",
                    selectMode === "off"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground",
                  )}
                  onClick={() => setSelectMode("off")}
                  aria-label="Orbit (no selection)"
                  aria-pressed={selectMode === "off"}
                >
                  <Compass className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Orbit (no selection)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canSelect}
                  className={cn(
                    "h-7 w-7",
                    selectMode === "all" && "bg-primary text-primary-foreground",
                  )}
                  onClick={() =>
                    setSelectMode(selectMode === "all" ? "off" : "all")
                  }
                  aria-label="Select all (vertices, edges, faces)"
                  aria-pressed={selectMode === "all"}
                >
                  <Crosshair className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {canSelect
                  ? "Select all (vertices, edges, faces)"
                  : "Selection requires a Build123D part (B-rep)"}
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canSelect}
                  className={cn(
                    "h-7 w-7",
                    selectMode === "precise" &&
                      "bg-primary text-primary-foreground",
                  )}
                  onClick={() =>
                    setSelectMode(selectMode === "precise" ? "off" : "precise")
                  }
                  aria-label="Select a specific entity type"
                  aria-pressed={selectMode === "precise"}
                >
                  <Target className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {canSelect
                  ? "Select precise (face / edge / vertex)"
                  : "Selection requires a Build123D part (B-rep)"}
              </TooltipContent>
            </Tooltip>
          </div>
        </div>
        <SelectionIndicator align="start" side="top" variant="overlay" />
      </div>
      <div className="absolute right-3 top-3 flex items-center gap-1">
        {mesh && (
          <div className="flex items-center gap-0.5 rounded-md border bg-background/80 p-0.5">
            {VIEW_MODES.map((m) => {
              const Icon = m.icon;
              const active = m.value === viewMode;
              return (
                <Tooltip key={m.value}>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className={cn(
                        "h-7 w-7",
                        active && "bg-primary text-primary-foreground",
                      )}
                      onClick={() => setViewMode(m.value)}
                      aria-label={m.label}
                      aria-pressed={active}
                    >
                      <Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">{m.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        )}

        <div className="flex items-center gap-0.5 rounded-md border bg-background/80 p-0.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-7 w-7",
                  showGrid
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
                onClick={() => setShowGrid((v) => !v)}
                aria-label="Toggle reference grid"
                aria-pressed={showGrid}
              >
                <Grid2x2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showGrid ? "Hide reference grid" : "Show reference grid"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-7 w-7",
                  showAxes
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
                onClick={() => setShowAxes((v) => !v)}
                aria-label="Toggle reference axes"
                aria-pressed={showAxes}
              >
                <Axis3d className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showAxes ? "Hide reference axes" : "Show reference axes"}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className={cn(
                  "h-7 w-7",
                  showGizmo
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground",
                )}
                onClick={() => setShowGizmo((v) => !v)}
                aria-label="Toggle view cube"
                aria-pressed={showGizmo}
              >
                <Compass className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {showGizmo ? "Hide view cube" : "Show view cube"}
            </TooltipContent>
          </Tooltip>
        </div>

        {mesh && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                className="h-7 w-7 bg-background/80"
                onClick={() => frameRef.current?.()}
                aria-label="Frame model"
              >
                <Maximize2 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">Frame model (F)</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
