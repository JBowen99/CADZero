import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { config } from "../env";
import type { ExportResult, RenderResult } from "./types";

export type { ExportResult, RenderResult } from "./types";

const RENDER_TIMEOUT_MS = 30_000;
const VERSION_TIMEOUT_MS = 3_000;
const MAX_BUFFER = 20 * 1024 * 1024;

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

interface ScadOutputResult {
  ok: boolean;
  out?: Buffer;
  stderr: string;
  durationMs: number;
}

async function runScadToOutput(
  code: string,
  outExt: string,
): Promise<ScadOutputResult> {
  const dir = join(tmpdir(), "cadzero");
  await mkdir(dir, { recursive: true });
  const id = randomUUID();
  const scadPath = join(dir, `${id}.scad`);
  const outPath = join(dir, `${id}.${outExt}`);
  const start = Date.now();

  try {
    await writeFile(scadPath, code, "utf8");
    const { stderr } = await run(["-o", outPath, scadPath], RENDER_TIMEOUT_MS);
    let out: Buffer | undefined;
    try {
      const s = await stat(outPath);
      if (s.size > 0) out = await readFile(outPath);
    } catch {
      out = undefined;
    }
    return { ok: !!out, out, stderr: stderr.trim(), durationMs: Date.now() - start };
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
      rm(outPath, { force: true }),
    ]);
  }
}

export async function renderScad(code: string): Promise<RenderResult> {
  const r = await runScadToOutput(code, "stl");
  return { ok: r.ok, stl: r.out, stderr: r.stderr, durationMs: r.durationMs };
}

export async function exportScad(
  code: string,
  ext: string,
): Promise<ExportResult> {
  const r = await runScadToOutput(code, ext);
  return { ok: r.ok, data: r.out, stderr: r.stderr, durationMs: r.durationMs };
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
