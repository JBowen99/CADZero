import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../env";

const RENDER_TIMEOUT_MS = 30_000;
const VERSION_TIMEOUT_MS = 3_000;
const MAX_BUFFER = 20 * 1024 * 1024;

export interface RenderResult {
  ok: boolean;
  stl?: Buffer;
  stderr: string;
  durationMs: number;
}

interface ExecError extends Error {
  stderr?: string;
  stdout?: string;
  killed?: boolean;
}

function run(
  args: string[],
  timeout: number,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      config.openscadPath,
      args,
      { timeout, maxBuffer: MAX_BUFFER },
      (err, stdout, stderr) => {
        if (err) {
          const e = err as ExecError;
          reject(
            Object.assign(new Error(e.message), {
              stderr: stderr ?? e.stderr ?? "",
              stdout: stdout ?? e.stdout ?? "",
              killed: e.killed,
            }),
          );
          return;
        }
        resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
      },
    );
  });
}

export async function renderScad(code: string): Promise<RenderResult> {
  const dir = join(tmpdir(), "chatcad");
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const scadPath = join(dir, `${id}.scad`);
  const stlPath = join(dir, `${id}.stl`);
  const start = Date.now();

  try {
    await writeFile(scadPath, code, "utf8");
    const { stderr } = await run(["-o", stlPath, scadPath], RENDER_TIMEOUT_MS);
    let stl: Buffer | undefined;
    try {
      const s = await stat(stlPath);
      if (s.size > 0) stl = await readFile(stlPath);
    } catch {
      stl = undefined;
    }
    return { ok: !!stl, stl, stderr: stderr.trim(), durationMs: Date.now() - start };
  } catch (e) {
    const execErr = e as ExecError;
    const killed = execErr.killed === true;
    return {
      ok: false,
      stderr: (
        (execErr.stderr || "") +
        (killed ? "\nOpenSCAD render timed out." : "") +
        (execErr.stderr ? "" : ` ${execErr.message}`)
      ).trim(),
      durationMs: Date.now() - start,
    };
  } finally {
    await Promise.allSettled([
      rm(scadPath, { force: true }),
      rm(stlPath, { force: true }),
    ]);
  }
}

export async function checkOpenScad(): Promise<{
  ok: boolean;
  version?: string;
  error?: string;
}> {
  try {
    const { stdout, stderr } = await run(["--version"], VERSION_TIMEOUT_MS);
    return { ok: true, version: `${stdout} ${stderr}`.trim() };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
