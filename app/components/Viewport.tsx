import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  Grid,
  OrbitControls,
  useBounds,
} from "@react-three/drei";
import { useTheme } from "next-themes";
import { ArrowLeft, Box, Compass, Disc, Grid2x2, Grid3x3, Maximize2, RotateCcw } from "lucide-react";
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
import { buildMesh } from "~/lib/mesh-worker-client";

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

const VIEW_MODES: { value: ViewMode; label: string; icon: typeof Box }[] = [
  { value: "shaded", label: "Shaded", icon: Disc },
  { value: "solid", label: "Solid", icon: Box },
  { value: "wireframe", label: "Wireframe", icon: Grid3x3 },
];

// Front-right-top viewing direction (matches the default camera at [140,110,160]).
const FRONT_RIGHT_TOP_DIR = new THREE.Vector3(140, 110, 160).normalize();

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

function Scene({
  geometry,
  fitRef,
  frameRef,
  gridColors,
  interactingRef,
  viewMode,
  showGrid,
  showGizmo,
}: {
  geometry: THREE.BufferGeometry | null;
  fitRef: FitRef;
  frameRef: FitRef;
  gridColors: GridColors | null;
  interactingRef: InteractionRef;
  viewMode: ViewMode;
  showGrid: boolean;
  showGizmo: boolean;
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
            <group rotation={[-Math.PI / 2, 0, 0]}>
              {viewMode !== "wireframe" && (
                <mesh geometry={geometry} castShadow receiveShadow>
                  <meshStandardMaterial
                    color="#a5b4fc"
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
                  <lineBasicMaterial
                    color={viewMode === "wireframe" ? "#6366f1" : "#4338ca"}
                  />
                </lineSegments>
              )}
            </group>
          )}
        </Suspense>
      </Bounds>

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
  const previewingRevId = useDocumentsStore((s) => s.previewingRevId);
  const exitPreview = useDocumentsStore((s) => s.exitPreview);
  const restoreRevision = useDocumentsStore((s) => s.restoreRevision);
  const [geometry, setGeometry] = useState<THREE.BufferGeometry | null>(null);
  const [processing, setProcessing] = useState(false);
  const geometryRef = useRef<THREE.BufferGeometry | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const frameRef = useRef<(() => void) | null>(null);
  const interactingRef = useRef(false);
  const [viewMode, setViewMode] = useState<ViewMode>("shaded");
  const [showGrid, setShowGrid] = useState(true);
  const [showGizmo, setShowGizmo] = useState(true);

  const { resolvedTheme } = useTheme();
  const [gridColors, setGridColors] = useState<GridColors | null>(null);

  useEffect(() => {
    setGridColors({
      cell: resolveTokenColor("var(--color-border)") ?? "#9ca3af",
      section: resolveTokenColor("var(--color-muted-foreground)") ?? "#737373",
    });
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
          interactingRef={interactingRef}
          viewMode={viewMode}
          showGrid={showGrid}
          showGizmo={showGizmo}
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
          <span className="font-medium text-amber-600 dark:text-amber-400">
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
            onClick={() => void restoreRevision(previewingRevId)}
          >
            <RotateCcw className="size-3" />
            Restore
          </Button>
        </div>
      )}
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
                        active && "bg-accent text-accent-foreground",
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
                    ? "bg-accent text-accent-foreground"
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
                  showGizmo
                    ? "bg-accent text-accent-foreground"
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
