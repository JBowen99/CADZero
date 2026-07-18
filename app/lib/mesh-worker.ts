interface MeshWorkerInput {
  id: number;
  positions: Float32Array;
}

interface MeshWorkerOutput {
  id: number;
  positions: Float32Array;
  normals: Float32Array;
  edges: Float32Array;
  center: [number, number, number];
  radius: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MeshWorkerInput>) => void) | null;
  postMessage(message: MeshWorkerOutput, transfer: Transferable[]): void;
};

/** Matches Viewport EdgesGeometry threshold (degrees). */
const EDGE_THRESHOLD_DEG = 20;
const HASH_PRECISION = 1e4;

interface EdgeEntry {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  nx: number;
  ny: number;
  nz: number;
}

function hashVert(x: number, y: number, z: number): string {
  return `${Math.round(x * HASH_PRECISION)},${Math.round(y * HASH_PRECISION)},${Math.round(z * HASH_PRECISION)}`;
}

function computeNormals(positions: Float32Array, normals: Float32Array): void {
  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 4];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 7];
    const cz = positions[i + 8];
    const cbx = cx - bx;
    const cby = cy - by;
    const cbz = cz - bz;
    const abx = ax - bx;
    const aby = ay - by;
    const abz = az - bz;
    const nx = cby * abz - cbz * aby;
    const ny = cbz * abx - cbx * abz;
    const nz = cbx * aby - cby * abx;
    normals[i] += nx;
    normals[i + 1] += ny;
    normals[i + 2] += nz;
    normals[i + 3] += nx;
    normals[i + 4] += ny;
    normals[i + 5] += nz;
    normals[i + 6] += nx;
    normals[i + 7] += ny;
    normals[i + 8] += nz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const x = normals[i];
    const y = normals[i + 1];
    const z = normals[i + 2];
    const len = Math.sqrt(x * x + y * y + z * z);
    if (len > 0) {
      const inv = 1 / len;
      normals[i] = x * inv;
      normals[i + 1] = y * inv;
      normals[i + 2] = z * inv;
    }
  }
}

function computeBoundingSphere(positions: Float32Array): {
  center: [number, number, number];
  radius: number;
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  }
  const center: [number, number, number] = [
    (minX + maxX) / 2,
    (minY + maxY) / 2,
    (minZ + maxZ) / 2,
  ];
  let radiusSq = 0;
  for (let i = 0; i < positions.length; i += 3) {
    const dx = positions[i] - center[0];
    const dy = positions[i + 1] - center[1];
    const dz = positions[i + 2] - center[2];
    const d = dx * dx + dy * dy + dz * dz;
    if (d > radiusSq) radiusSq = d;
  }
  return { center, radius: Math.sqrt(radiusSq) };
}

/**
 * EdgesGeometry-equivalent crease edges (threshold in degrees).
 * Uses position hashes so non-indexed triangle soups share edges correctly.
 */
function computeEdges(
  positions: Float32Array,
  thresholdAngle = EDGE_THRESHOLD_DEG,
): Float32Array {
  const thresholdDot = Math.cos((thresholdAngle * Math.PI) / 180);
  const edgeData = new Map<string, EdgeEntry | null>();
  const out: number[] = [];

  for (let i = 0; i < positions.length; i += 9) {
    const ax = positions[i];
    const ay = positions[i + 1];
    const az = positions[i + 2];
    const bx = positions[i + 3];
    const by = positions[i + 4];
    const bz = positions[i + 5];
    const cx = positions[i + 6];
    const cy = positions[i + 7];
    const cz = positions[i + 8];

    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const acx = cx - ax;
    const acy = cy - ay;
    const acz = cz - az;
    let nx = aby * acz - abz * acy;
    let ny = abz * acx - abx * acz;
    let nz = abx * acy - aby * acx;
    const nLen = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (nLen > 0) {
      const inv = 1 / nLen;
      nx *= inv;
      ny *= inv;
      nz *= inv;
    }

    const ha = hashVert(ax, ay, az);
    const hb = hashVert(bx, by, bz);
    const hc = hashVert(cx, cy, cz);
    if (ha === hb || hb === hc || hc === ha) continue;

    const verts: [number, number, number, string][] = [
      [ax, ay, az, ha],
      [bx, by, bz, hb],
      [cx, cy, cz, hc],
    ];

    for (let j = 0; j < 3; j++) {
      const jNext = (j + 1) % 3;
      const [v0x, v0y, v0z, h0] = verts[j];
      const [v1x, v1y, v1z, h1] = verts[jNext];
      const hash = `${h0}_${h1}`;
      const reverseHash = `${h1}_${h0}`;

      if (edgeData.has(reverseHash) && edgeData.get(reverseHash)) {
        const sibling = edgeData.get(reverseHash)!;
        if (nx * sibling.nx + ny * sibling.ny + nz * sibling.nz <= thresholdDot) {
          out.push(v0x, v0y, v0z, v1x, v1y, v1z);
        }
        edgeData.set(reverseHash, null);
      } else if (!edgeData.has(hash)) {
        edgeData.set(hash, {
          ax: v0x,
          ay: v0y,
          az: v0z,
          bx: v1x,
          by: v1y,
          bz: v1z,
          nx,
          ny,
          nz,
        });
      }
    }
  }

  for (const entry of edgeData.values()) {
    if (!entry) continue;
    out.push(entry.ax, entry.ay, entry.az, entry.bx, entry.by, entry.bz);
  }

  return new Float32Array(out);
}

ctx.onmessage = (e) => {
  const { id, positions } = e.data;
  const normals = new Float32Array(positions.length);
  computeNormals(positions, normals);
  const { center, radius } = computeBoundingSphere(positions);
  const edges = computeEdges(positions);
  ctx.postMessage(
    { id, positions, normals, edges, center, radius },
    [positions.buffer, normals.buffer, edges.buffer],
  );
};
