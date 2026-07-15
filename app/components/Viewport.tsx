import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import type { Hole, MeshDescriptor } from "~/types";
import { useModelStore } from "~/store/useModelStore";

function MeshGeometry({ mesh }: { mesh: MeshDescriptor }) {
  const [w, d, h] = mesh.size ?? [50, 50, 50];

  return (
    <group>
      <mesh castShadow receiveShadow>
        {mesh.kind === "sphere" && <sphereGeometry args={[mesh.radius ?? 25, 64, 64]} />}
        {mesh.kind === "cylinder" && (
          <cylinderGeometry args={[mesh.radius ?? 20, mesh.radius ?? 20, mesh.height ?? 60, 64]} />
        )}
        {(mesh.kind === "box" || mesh.kind === "plate") && (
          <boxGeometry args={[w, d, h]} />
        )}
        <meshStandardMaterial color={mesh.color} metalness={0.1} roughness={0.5} />
      </mesh>

      {mesh.holes?.map((hole, i) => (
        <HoleGeometry key={i} hole={hole} depth={h + 4} />
      ))}
    </group>
  );
}

function HoleGeometry({ hole, depth }: { hole: Hole; depth: number }) {
  return (
    <mesh position={[hole.position[0], hole.position[1], 0]}>
      <cylinderGeometry args={[hole.radius, hole.radius, depth, 32]} />
      <meshStandardMaterial color="#0a0a0a" metalness={0.2} roughness={0.7} />
    </mesh>
  );
}

function Scene({ mesh }: { mesh: MeshDescriptor | null }) {
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

      <Suspense fallback={null}>
        {mesh ? (
          <Bounds fit clip observe margin={1.2}>
            <MeshGeometry mesh={mesh} />
          </Bounds>
        ) : null}
      </Suspense>

      <Grid
        args={[400, 400]}
        cellSize={5}
        cellThickness={0.6}
        cellColor="var(--color-border)"
        sectionSize={50}
        sectionThickness={1.2}
        sectionColor="var(--color-muted-foreground)"
        fadeDistance={320}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid
      />

      <GizmoHelper alignment="bottom-right" margin={[64, 64]}>
        <GizmoViewport
          axisColors={["#ef4444", "#22c55e", "#3b82f6"]}
          labelColor="white"
        />
      </GizmoHelper>

      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.1}
        minDistance={20}
        maxDistance={600}
      />
    </>
  );
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

  return (
    <div className="relative h-full w-full bg-muted/30">
      <Canvas
        shadows
        camera={{ position: [140, 110, 160], fov: 45, near: 0.1, far: 2000 }}
        dpr={[1, 2]}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <color attach="background" args={["var(--color-background)"]} />
        <Scene mesh={mesh} />
      </Canvas>

      {!mesh && <EmptyHint />}
    </div>
  );
}
