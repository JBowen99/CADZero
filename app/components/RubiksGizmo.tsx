import * as React from "react";
import type { ThreeEvent } from "@react-three/fiber";
import { useGizmoContext } from "@react-three/drei";
import {
  CanvasTexture,
  Color,
  SRGBColorSpace,
  Vector3,
} from "three";

// Plain (uncolored) 3x3x3 view-cube gizmo. Clicking any cubie tweens the main
// camera so that cubie's direction faces the viewer (face-center → axis view,
// edge → edge view, corner → isometric). The six face-center cubies are labeled
// X / Y / Z / -X / -Y / -Z on their outward face.

const CUBIE_FACE = "#d4d4d8"; // outer (plain) cubie faces
const BODY = "#18181b"; // inner cubie faces + gap backing (the dark frame)
const TEXT = "#18181b"; // label glyph
const CUBIE = 0.94; // cubie edge length (spacing is 1.0 → visible dark gaps)
const CORE = 2.9; // backing box so inter-cubie gaps read as a dark frame
const GROUP_SCALE = 20; // overall footprint (~matches drei GizmoViewcube)
const HOVER_AMOUNT = 0.3;

const white = new Color("#ffffff");
const tmp = new Color();
const CUBIE_FACE_HOVER = tmp.set(CUBIE_FACE).lerp(white, HOVER_AMOUNT).getStyle();

// three.js BoxGeometry material index: 0:+X 1:-X 2:+Y 3:-Y 4:+Z 5:-Z
function isOuter(gx: number, gy: number, gz: number, faceIndex: number): boolean {
  switch (faceIndex) {
    case 0:
      return gx === 1;
    case 1:
      return gx === -1;
    case 2:
      return gy === 1;
    case 3:
      return gy === -1;
    case 4:
      return gz === 1;
    case 5:
      return gz === -1;
    default:
      return false;
  }
}

type FaceCenter = { faceIndex: number; label: string };

function faceCenter(
  gx: number,
  gy: number,
  gz: number,
): FaceCenter | null {
  if (gx === 1 && gy === 0 && gz === 0) return { faceIndex: 0, label: "X" };
  if (gx === -1 && gy === 0 && gz === 0) return { faceIndex: 1, label: "-X" };
  if (gy === 1 && gx === 0 && gz === 0) return { faceIndex: 2, label: "Y" };
  if (gy === -1 && gx === 0 && gz === 0) return { faceIndex: 3, label: "-Y" };
  if (gz === 1 && gx === 0 && gy === 0) return { faceIndex: 4, label: "Z" };
  if (gz === -1 && gx === 0 && gy === 0) return { faceIndex: 5, label: "-Z" };
  return null;
}

const labelCache = new Map<string, CanvasTexture>();
function getLabelTexture(label: string): CanvasTexture {
  const cached = labelCache.get(label);
  if (cached) return cached;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.fillStyle = CUBIE_FACE;
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = TEXT;
    ctx.font = `bold ${label.length > 1 ? 64 : 84}px Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, size / 2, size / 2 + 4);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  labelCache.set(label, tex);
  return tex;
}

type FaceMat =
  | { kind: "color"; color: string }
  | { kind: "label"; label: string };

function buildFaceMaterials(
  gx: number,
  gy: number,
  gz: number,
  hover: boolean,
): FaceMat[] {
  const center = faceCenter(gx, gy, gz);
  const hoverColor = CUBIE_FACE_HOVER;
  return [0, 1, 2, 3, 4, 5].map((i) => {
    if (center && center.faceIndex === i) {
      return { kind: "label" as const, label: center.label };
    }
    const outer = isOuter(gx, gy, gz, i);
    return {
      kind: "color" as const,
      color: outer ? (hover ? hoverColor : CUBIE_FACE) : BODY,
    };
  });
}

function Cubie({
  gx,
  gy,
  gz,
}: {
  gx: number;
  gy: number;
  gz: number;
}) {
  const { tweenCamera } = useGizmoContext();
  const [hover, setHover] = React.useState(false);

  const dirRef = React.useRef(new Vector3(gx, gy, gz));
  const materials = React.useMemo(
    () => buildFaceMaterials(gx, gy, gz, hover),
    [gx, gy, gz, hover],
  );

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    tweenCamera(dirRef.current);
  };
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(true);
    document.body.style.cursor = "pointer";
  };
  const handleOut = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    setHover(false);
    document.body.style.cursor = "";
  };

  return (
    <mesh
      position={[gx, gy, gz]}
      scale={hover ? 1.1 : 1}
      onPointerOver={handleOver}
      onPointerOut={handleOut}
      onClick={handleClick}
    >
      <boxGeometry args={[CUBIE, CUBIE, CUBIE]} />
      {materials.map((m, i) =>
        m.kind === "label" ? (
          <meshBasicMaterial
            key={i}
            attach={`material-${i}`}
            map={getLabelTexture(m.label)}
            toneMapped={false}
          />
        ) : (
          <meshBasicMaterial
            key={i}
            attach={`material-${i}`}
            color={m.color}
            toneMapped={false}
          />
        ),
      )}
    </mesh>
  );
}

export function RubiksGizmo() {
  const cubies = React.useMemo(() => {
    const out: { gx: number; gy: number; gz: number }[] = [];
    for (let x = -1; x <= 1; x++) {
      for (let y = -1; y <= 1; y++) {
        for (let z = -1; z <= 1; z++) {
          if (x === 0 && y === 0 && z === 0) continue; // hidden core cubie
          out.push({ gx: x, gy: y, gz: z });
        }
      }
    }
    return out;
  }, []);

  return (
    <group scale={GROUP_SCALE}>
      {/* Solid backing so inter-cubie gaps read as the dark cube frame. */}
      <mesh raycast={() => null}>
        <boxGeometry args={[CORE, CORE, CORE]} />
        <meshBasicMaterial color={BODY} toneMapped={false} />
      </mesh>
      {cubies.map((c, i) => (
        <Cubie key={i} gx={c.gx} gy={c.gy} gz={c.gz} />
      ))}
    </group>
  );
}
