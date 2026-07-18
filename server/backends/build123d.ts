import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../env";
import { BUILD123D_WORKER_SOURCE } from "./build123d_worker_asset";
import type { TriangleMesh } from "../renderer/stl";
import type { Topology } from "../renderer/topology";
import type { ExportResult, RenderResult } from "./types";

const RENDER_TIMEOUT_MS = 30_000;
const EXPORT_TIMEOUT_MS = 90_000;
const VERSION_TIMEOUT_MS = 30_000;

let workerScriptPath: string | null = null;

function getWorkerScript(): string {
  if (workerScriptPath && existsSync(workerScriptPath)) return workerScriptPath;
  workerScriptPath = join(tmpdir(), `cadzero-build123d-worker-${randomUUID()}.py`);
  writeFileSync(workerScriptPath, BUILD123D_WORKER_SOURCE, { mode: 0o644 });
  return workerScriptPath;
}

function bundledPythonBin(): string | null {
  // Explicit override via env/config
  if (config.pythonPath && config.pythonPath.length > 0) {
    return existsSync(config.pythonPath) ? config.pythonPath : null;
  }
  // Packaged Electron app: runtime shipped as extraResources/python-runtime
  const resourcesPath = process.resourcesPath;
  if (resourcesPath) {
    const candidate = join(resourcesPath, "python-runtime", "bin", "python3");
    if (existsSync(candidate)) return candidate;
  }
  // Dev mode: runtime at <repo>/server/python/bin/python3
  const dev = join(process.cwd(), "server", "python", "bin", "python3");
  if (existsSync(dev)) return dev;
  return null;
}

export function resolvePythonBin(): string {
  const bundled = bundledPythonBin();
  if (bundled) return bundled;
  // Last-resort: hope system python3 has build123d
  return "python3";
}

function cleanBuild123dError(rawStderr: string): string {
  const text = rawStderr.trim();
  if (!text) return "";
  const lines = text.split("\n");
  for (const line of lines) {
    const l = line.trim();
    if (/No module named ['"]?build123d/.test(l)) {
      return "build123d not installed (pip install build123d)";
    }
    if (l.startsWith("ModuleNotFoundError:") || l.startsWith("ImportError:")) {
      return l;
    }
    if (l.includes("No module named")) {
      return l;
    }
  }
  const last = lines.filter((l) => l.trim()).pop();
  if (last && last.trim().length <= 100) return last.trim();
  return "Build123D runtime error";
}

type Pending = {
  resolve: (res: WorkerResponse) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

interface WorkerResponse {
  id: string | null;
  ok: boolean;
  error?: string;
  version?: string;
  ready?: boolean;
}

class Build123DWorker {
  private proc: ChildProcess | null = null;
  private pending = new Map<string, Pending>();
  private starting: Promise<void> | null = null;
  private stderrBuf: string[] = [];

  private spawn(): Promise<void> {
    const bin = resolvePythonBin();
    const proc = spawn(bin, ["-u", getWorkerScript()], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    const readline = createInterface({ input: proc.stdout, crlfDelay: Infinity });
    this.starting = new Promise<void>((resolveStart, rejectStart) => {
      let started = false;
      readline.on("line", (line) => {
        let msg: WorkerResponse;
        try {
          msg = JSON.parse(line) as WorkerResponse;
        } catch {
          return;
        }
        if (!started && msg.ready) {
          started = true;
          resolveStart();
          return;
        }
        const id = msg.id;
        if (!id) return;
        const p = this.pending.get(id);
        if (!p) return;
        clearTimeout(p.timer);
        this.pending.delete(id);
        p.resolve(msg);
      });
      readline.on("close", () => {
        this.failAll(new Error("Build123D worker stdout closed."));
      });
      const onDead = () => {
        if (!started) {
          rejectStart(
            new Error(
              "Build123D worker failed to start. " +
                this.stderrBuf.join("").trim(),
            ),
          );
        }
        this.failAll(new Error("Build123D worker exited unexpectedly."));
      };
      proc.on("exit", onDead);
      proc.on("error", (err) => {
        if (!started) rejectStart(err);
        this.failAll(err);
      });
    });

    let buf = "";
    proc.stderr?.on("data", (chunk: Buffer) => {
      buf += chunk.toString();
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        this.stderrBuf.push(buf.slice(0, nl + 1));
        buf = buf.slice(nl + 1);
      }
      if (this.stderrBuf.length > 200) this.stderrBuf.splice(0, this.stderrBuf.length - 200);
    });

    return this.starting;
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
    if (this.proc) {
      this.proc.removeAllListeners();
      this.proc.kill();
      this.proc = null;
    }
    this.starting = null;
  }

  private async ensure(): Promise<void> {
    if (this.proc && this.starting) {
      try {
        await this.starting;
        return;
      } catch {
        // fall through to respawn
      }
    }
    await this.spawn();
  }

  async request(code: string, outExt: string, timeoutMs: number): Promise<Buffer> {
    await this.ensure();
    if (!this.proc || !this.proc.stdin) {
      throw new Error("Build123D worker is not running.");
    }
    const dir = join(tmpdir(), "cadzero");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const outPath = join(dir, `${id}.${outExt}`);
    const req = JSON.stringify({ id, code, out_path: outPath, format: outExt });

    const result = await new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error("Build123D render timed out.");
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          p.reject(err);
        }
        this.failAll(err);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin!.write(req + "\n");
    });

    if (!result.ok) {
      rmSync(outPath, { force: true });
      throw new Error(result.error || "Build123D render failed.");
    }
    try {
      return await readFile(outPath);
    } finally {
      rmSync(outPath, { force: true });
    }
  }

  async tessellate(
    code: string,
    timeoutMs: number,
  ): Promise<{ mesh: TriangleMesh; topology: Topology | null }> {
    await this.ensure();
    if (!this.proc || !this.proc.stdin) {
      throw new Error("Build123D worker is not running.");
    }
    const dir = join(tmpdir(), "cadzero");
    await mkdir(dir, { recursive: true });
    const id = randomUUID();
    const outPath = join(dir, `${id}.bin`);
    const topoPath = `${outPath}.topo.json`;
    const req = JSON.stringify({ id, code, out_path: outPath, format: "tessellate" });

    const result = await new Promise<WorkerResponse>((resolve, reject) => {
      const timer = setTimeout(() => {
        const err = new Error("Build123D render timed out.");
        const p = this.pending.get(id);
        if (p) {
          this.pending.delete(id);
          p.reject(err);
        }
        this.failAll(err);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.proc!.stdin!.write(req + "\n");
    });

    if (!result.ok) {
      rmSync(outPath, { force: true });
      rmSync(topoPath, { force: true });
      throw new Error(result.error || "Build123D render failed.");
    }
    try {
      const bin = await readFile(outPath);
      if (bin.length < 4) throw new Error("tessellation output too small");
      const triangleCount = bin.readUInt32LE(0);
      const floatCount = (bin.length - 4) / 4;
      const view = new Float32Array(bin.buffer, bin.byteOffset + 4, floatCount);
      const positions = Array.from(view);
      let topology: Topology | null = null;
      try {
        const raw = await readFile(topoPath, "utf8");
        topology = JSON.parse(raw) as Topology;
      } catch {
        topology = null;
      }
      return { mesh: { positions, triangleCount }, topology };
    } finally {
      rmSync(outPath, { force: true });
      rmSync(topoPath, { force: true });
    }
  }

  async version(): Promise<string> {
    await this.ensure();
    return "ok";
  }
}

const worker = new Build123DWorker();

export async function renderBuild123d(code: string): Promise<RenderResult> {
  const start = Date.now();
  try {
    const { mesh, topology } = await worker.tessellate(code, RENDER_TIMEOUT_MS);
    return { ok: true, mesh, topology, stderr: "", durationMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      stderr: (e as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

export async function exportBuild123d(
  code: string,
  ext: string,
): Promise<ExportResult> {
  const start = Date.now();
  try {
    const data = await worker.request(code, ext, EXPORT_TIMEOUT_MS);
    return { ok: true, data, stderr: "", durationMs: Date.now() - start };
  } catch (e) {
    return {
      ok: false,
      stderr: (e as Error).message,
      durationMs: Date.now() - start,
    };
  }
}

export async function checkBuild123d(): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  const bin = resolvePythonBin();
  return new Promise((resolve) => {
    let called = false;
    const done = (r: { ok: boolean; version?: string; error?: string }) => {
      if (called) return;
      called = true;
      resolve(r);
    };
    const proc = spawn(bin, ["-u", getWorkerScript()], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    const readline = createInterface({
      input: proc.stdout,
      crlfDelay: Infinity,
    });
    const timer = setTimeout(() => {
      proc.kill();
      done({
        ok: false,
        error: "Build123D import timed out. " + stderrBuf.join("").trim(),
      });
    }, VERSION_TIMEOUT_MS);
    let stderrBuf: string[] = [];
    readline.on("line", (line) => {
      try {
        const msg = JSON.parse(line) as WorkerResponse;
        if (msg.ready) {
          clearTimeout(timer);
          proc.kill();
          done({ ok: true, version: msg.version });
        }
      } catch {
        /* ignore non-json */
      }
    });
    proc.stderr?.on("data", (chunk: Buffer) => {
      stderrBuf.push(chunk.toString());
    });
    proc.on("exit", () => {
      clearTimeout(timer);
      const cleaned = cleanBuild123dError(stderrBuf.join(""));
      done({
        ok: false,
        error: cleaned ||
          (bundledPythonBin()
            ? ""
            : "Python runtime not bundled. Run scripts/setup-python.sh before packaging."),
      });
    });
    proc.on("error", (err) => {
      clearTimeout(timer);
      done({ ok: false, error: err.message });
    });
  });
}
