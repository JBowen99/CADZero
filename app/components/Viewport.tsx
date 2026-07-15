import { Suspense, useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  GizmoHelper,
  GizmoViewport,
  Grid,
  OrbitControls,
} from "@react-three/drei";
import * as THREE from "three";
import type { TriangleMesh } from "~/types";
import { useModelStore } from "~/store/useModelStore";

function TriangleMeshGeometry({ mesh }: { mesh: TriangleMesh }) {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(mesh.positions, 3),
    );
    geo.computeVertexNormals();
    geo.computeBoundingSphere();
    return geo;
  }, [mesh.positions]);

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color="#a5b4fc" metalness={0.1} roughness={0.5} />
    </mesh>
  );
}

function Scene({ mesh }: { mesh: TriangleMesh | null }) {
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
            <TriangleMeshGeometry mesh={mesh} />
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
