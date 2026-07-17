import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  Grid,
  Line,
  OrbitControls,
  useBounds,
} from "@react-three/drei";
import { useTheme } from "next-themes";
import { ArrowLeft, Axis3d, Box, Compass, Disc, Grid2x2, Grid3x3, Loader2, Maximize2, MousePointer2, RotateCcw, TriangleAlert } from "lucide-react";
import * as THREE from "three";
import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";
import { RubiksGizmo } from "~/components/RubiksGizmo";
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
type SelectMode = "off" | "face" | "edge" | "vertex";

const VIEW_MODES: { value: ViewMode; label: string; icon: typeof Box }[] = [
  { value: "shaded", label: "Shaded", icon: Disc },
  { value: "solid", label: "Solid", icon: Box },
  { value: "wireframe", label: "Wireframe", icon: Grid3x3 },
];

const SELECT_MODES: { value: SelectMode; label: string; icon: typeof Box }[] = [
  { value: "face", label: "Select faces", icon: Disc },
  { value: "edge", label: "Select edges", icon: Box },
  { value: "vertex", label: "Select vertices", icon: MousePointer2 },
];

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
const PICK_COLOR = "#9ca3af";

function FaceHighlight({
  geometry,
  face,
}: {
  geometry: THREE.BufferGeometry;
  face: FaceGroup;
}) {
  const geo = useMemo(() => {
    const pos = geometry.getAttribute("position") as THREE.BufferAttribute;
    const arr = pos.array as ArrayLike<number> & { slice: (a: number, b: number) => ArrayLike<number> };
    const start = face.startTri * 9;
    const end = face.endTri * 9;
    const sliced = Float32Array.from(arr.slice(start, end) as ArrayLike<number>);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(sliced, 3));
    return g;
  }, [geometry, face.startTri, face.endTri]);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <meshBasicMaterial
        color={HIGHLIGHT_COLOR}
        transparent
        opacity={0.5}
        side={THREE.DoubleSide}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
        polygonOffsetUnits={-1}
      />
    </mesh>
  );
}

function SelectionLayers({
  geometry,
  topology,
  selectMode,
  selection,
  onToggle,
}: {
  geometry: THREE.BufferGeometry;
  topology: Topology;
  selectMode: SelectMode;
  selection: TopologySelection[];
  onToggle: (sel: TopologySelection) => void;
}) {
  const dotRadius = useMemo(() => {
    geometry.computeBoundingSphere();
    const r = geometry.boundingSphere?.radius ?? 10;
    return Math.max(0.4, r * 0.012);
  }, [geometry]);

  const isSelected = (kind: TopologySelection["kind"], id: string) =>
    selection.some((s) => s.kind === kind && s.id === id);

  const showAllEdges = selectMode === "edge";
  const showAllVertices = selectMode === "vertex";

  return (
    <group>
      {selection
        .filter((s) => s.kind === "face")
        .map((s) => {
          const face = topology.faces.find((f) => f.id === s.id);
          return face ? (
            <FaceHighlight key={`fh-${s.id}`} geometry={geometry} face={face} />
          ) : null;
        })}

      {topology.edges.map((edge) => {
        const selected = isSelected("edge", edge.id);
        if (!showAllEdges && !selected) return null;
        const pts: [number, number, number][] = [];
        for (let i = 0; i < edge.positions.length; i += 3) {
          pts.push([
            edge.positions[i],
            edge.positions[i + 1],
            edge.positions[i + 2],
          ]);
        }
        return (
          <Line
            key={`el-${edge.id}`}
            points={pts}
            color={selected ? HIGHLIGHT_COLOR : PICK_COLOR}
            lineWidth={selected ? 4 : 2}
            transparent={!selected}
            opacity={selected ? 1 : 0.5}
            onClick={showAllEdges ? () => onToggle(edgeSelection(edge)) : undefined}
          />
        );
      })}

      {topology.vertices.map((v) => {
        const selected = isSelected("vertex", v.id);
        if (!showAllVertices && !selected) return null;
        return (
          <mesh
            key={`vd-${v.id}`}
            position={v.position}
            onClick={
              showAllVertices
                ? (e) => {
                    e.stopPropagation();
                    onToggle(vertexSelection(v));
                  }
                : undefined
            }
          >
            <sphereGeometry args={[dotRadius * (selected ? 1.6 : 1), 16, 16]} />
            <meshStandardMaterial
              color={selected ? HIGHLIGHT_COLOR : PICK_COLOR}
              emissive={selected ? HIGHLIGHT_COLOR : "#000000"}
              emissiveIntensity={selected ? 0.4 : 0}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function Scene({
  geometry,
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
  selection,
  onToggleSelection,
}: {
  geometry: THREE.BufferGeometry | null;
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
  selection: TopologySelection[];
  onToggleSelection: (sel: TopologySelection) => void;
}) {
  const edgesRef = useRef<THREE.EdgesGeometry | null>(null);
  const edges = useMemo(() => {
    edgesRef.current?.dispose();
    edgesRef.current = null;
    const showEdges = viewMode === "solid" || viewMode === "wireframe";
    if (!showEdges || !geometry) return null;
    const e = new THREE.EdgesGeometry(geometry, 20);
    edgesRef.current = e;
    return e;
  }, [geometry, viewMode]);
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
                  geometry={geometry}
                  castShadow
                  receiveShadow
                  onClick={
                    selectMode === "face" && topology
                      ? (e) => {
                          e.stopPropagation();
                          const fi = e.faceIndex;
                          if (fi == null) return;
                          const face = topology.faces.find(
                            (f) => fi >= f.startTri && fi < f.endTri,
                          );
                          if (face) onToggleSelection(faceSelection(face));
                        }
                      : undefined
                  }
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
                <SelectionLayers
                  geometry={geometry}
                  topology={topology}
                  selectMode={selectMode}
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

export function Viewport() {
  const mesh = useModelStore((s) => s.mesh);
  const topology = useModelStore((s) => s.topology);
  const language = useModelStore((s) => s.language);
  const rendering = useModelStore((s) => s.isRendering);
  const selection = useSelectionStore((s) => s.selection);
  const toggleSelection = useSelectionStore((s) => s.toggle);
  const clearSelection = useSelectionStore((s) => s.clear);
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const exitPreview = useDocumentsStore((s) => s.exitPreview);
  const renderActiveCode = useDocumentsStore((s) => s.renderActiveCode);
  const meshStale = useDocumentsStore((s) => {
    const d = s.openDocs.find((x) => x.clientId === s.activeClientId);
    return !!d?.mesh && d.cadCode !== (d.meshCode ?? "");
  });
  const restoreWithNote = useRestoreWithNote();
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [processing, setProcessing] = useState(false);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const interactingRef = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>("shaded");
  const [selectMode, setSelectMode] = useState<SelectMode>("off");
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
      setGeometry(null);
      setProcessing(false);
      return;
    }

    let cancelled = false;
    setProcessing(true);
    const positions = new Float32Array(mesh.positions);

    buildMesh(positions)
      .then(({ positions: p, normals, center, radius }) => {
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
        setGeometry(geo);
        setProcessing(false);
      })
      .catch(() => {
        if (!cancelled) setProcessing(false);
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
          selection={selection}
          onToggleSelection={toggleSelection}
        />
      </Canvas>

      {!mesh && <EmptyHint />}
      {processing && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm">
          Processing mesh…
        </div>
      )}
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
      {rendering ? (
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
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-md border bg-background/80 p-0.5">
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
            {SELECT_MODES.map((m) => {
              const Icon = m.icon;
              const active = m.value === selectMode;
              return (
                <Button
                  key={m.value}
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  disabled={!canSelect}
                  className={cn(
                    "h-7 w-7",
                    active && "bg-primary text-primary-foreground",
                  )}
                  onClick={() => setSelectMode(active ? "off" : m.value)}
                  aria-label={m.label}
                  aria-pressed={active}
                >
                  <Icon className="size-4" />
                </Button>
              );
            })}
            {selection.length > 0 && (
              <button
                type="button"
                onClick={clearSelection}
                className="ml-1 mr-0.5 rounded px-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground"
                aria-label="Clear selection"
              >
                {selection.length}
              </button>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          {canSelect
            ? "Pick faces / edges / vertices to add as chat context"
            : "Selection requires a Build123D part (B-rep)"}
        </TooltipContent>
      </Tooltip>
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
