export interface MeshWorkerOutput {
  positions: Float32Array;
  normals: Float32Array;
  center: [number, number, number];
  radius: number;
}

interface MeshWorkerResponse extends MeshWorkerOutput {
  id: number;
}

interface MeshWorkerRequest {
  id: number;
  positions: Float32Array;
}

interface PendingEntry {
  resolve: (output: MeshWorkerOutput) => void;
  reject: (error: unknown) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, PendingEntry>();

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./mesh-worker.ts", import.meta.url), {
      type: "module",
    });
    worker.onmessage = (e: MessageEvent<MeshWorkerResponse>) => {
      const { id, ...rest } = e.data;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      entry.resolve(rest);
    };
    worker.onerror = (error) => {
      for (const entry of pending.values()) entry.reject(error);
      pending.clear();
    };
  }
  return worker;
}

export function buildMesh(positions: Float32Array): Promise<MeshWorkerOutput> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const request: MeshWorkerRequest = { id, positions };
    getWorker().postMessage(request, [positions.buffer]);
  });
}
