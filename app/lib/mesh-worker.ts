interface MeshWorkerInput {
  id: number;
  positions: Float32Array;
}

interface MeshWorkerOutput {
  id: number;
  positions: Float32Array;
  normals: Float32Array;
  center: [number, number, number];
  radius: number;
}

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<MeshWorkerInput>) => void) | null;
  postMessage(message: MeshWorkerOutput, transfer: Transferable[]): void;
};

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

ctx.onmessage = (e) => {
  const { id, positions } = e.data;
  const normals = new Float32Array(positions.length);
  computeNormals(positions, normals);
  const { center, radius } = computeBoundingSphere(positions);
  ctx.postMessage(
    { id, positions, normals, center, radius },
    [positions.buffer, normals.buffer],
  );
};
