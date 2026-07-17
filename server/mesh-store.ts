import { randomUUID } from "node:crypto";
import type { TriangleMesh } from "./renderer/stl";
import type { Topology } from "./renderer/topology";

const MAX_ENTRIES = 64;

interface StoredMesh {
  mesh: TriangleMesh;
  topology: Topology | null;
}

const store = new Map<string, StoredMesh>();

function touch(id: string): StoredMesh | undefined {
  const entry = store.get(id);
  if (entry) {
    store.delete(id);
    store.set(id, entry);
  }
  return entry;
}

export function storeMesh(
  mesh: TriangleMesh,
  topology: Topology | null = null,
): string {
  const id = randomUUID();
  store.set(id, { mesh, topology });
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return id;
}

export function getMesh(id: string): TriangleMesh | undefined {
  return touch(id)?.mesh;
}

export function getTopology(id: string): Topology | null | undefined {
  return touch(id)?.topology;
}
