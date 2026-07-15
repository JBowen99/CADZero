import { randomUUID } from "node:crypto";
import type { TriangleMesh } from "./renderer/stl";

const MAX_ENTRIES = 64;

const store = new Map<string, TriangleMesh>();

export function storeMesh(mesh: TriangleMesh): string {
  const id = randomUUID();
  store.set(id, mesh);
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
  return id;
}

export function getMesh(id: string): TriangleMesh | undefined {
  const mesh = store.get(id);
  if (mesh) {
    store.delete(id);
    store.set(id, mesh);
  }
  return mesh;
}
