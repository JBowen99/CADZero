#!/usr/bin/env node
/**
 * Downloads a self-contained CPython 3.12 (python-build-standalone) and installs
 * build123d (+ OCP / OpenCascade) into it. The result lives at server/python and
 * is spawned by the backend to render Build123D scripts.
 *
 * Idempotent: skips the download if the host Python binary already exists
 * (unless --reinstall is passed). Re-running only re-installs/updates build123d.
 *
 * Usage: node scripts/setup-python.mjs [--reinstall]
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const PBS_TAG = "20260623";
const PBS_PY = "3.12.13";
const PBS_FLAVOR = "install_only";
const BUILD123D_VERSION = "0.11.1";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_DIR = join(REPO_ROOT, "server", "python");

const FORCE = process.argv.includes("--reinstall");
for (const arg of process.argv.slice(2)) {
  if (arg !== "--reinstall") {
    console.error(`unknown arg: ${arg}`);
    process.exit(2);
  }
}

function hostArch() {
  switch (process.platform) {
    case "linux":
      return "x86_64-unknown-linux-gnu";
    case "win32":
      return "x86_64-pc-windows-msvc";
    default:
      console.error(
        `Unsupported platform for bundled Python: ${process.platform}. ` +
          "Supported: linux, win32.",
      );
      process.exit(1);
  }
}

function pythonBin(targetDir) {
  return process.platform === "win32"
    ? join(targetDir, "python.exe")
    : join(targetDir, "bin", "python3");
}

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    ...opts,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function runCapture(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? "").trim();
}

const arch = hostArch();
const asset = `cpython-${PBS_PY}+${PBS_TAG}-${arch}-${PBS_FLAVOR}.tar.gz`;
const url = `https://github.com/astral-sh/python-build-standalone/releases/download/${PBS_TAG}/${asset}`;
const pyBin = pythonBin(TARGET_DIR);

if (existsSync(pyBin) && !FORCE) {
  console.log(
    `==> Python already present at ${pyBin} (use --reinstall to replace)`,
  );
} else {
  console.log(`==> Downloading ${asset}`);
  const tmp = await mkdtemp(join(tmpdir(), "cadzero-python-"));
  const archivePath = join(tmp, asset);
  try {
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`download failed: ${res.status} ${res.statusText} (${url})`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await writeFile(archivePath, buf);

    rmSync(TARGET_DIR, { recursive: true, force: true });
    mkdirSync(TARGET_DIR, { recursive: true });
    // PBS install_only archives nest under a top-level "python/" directory.
    run("tar", ["-xzf", archivePath, "-C", TARGET_DIR, "--strip-components=1"]);

    if (!existsSync(pyBin)) {
      throw new Error(`expected Python binary missing after extract: ${pyBin}`);
    }
    const version = runCapture(pyBin, ["--version"]);
    console.log(`==> Installed ${version} at ${TARGET_DIR}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

console.log("==> Installing build123d");
run(pyBin, ["-m", "pip", "install", "--quiet", "--upgrade", "pip"]);
run(pyBin, ["-m", "pip", "install", "--quiet", `build123d==${BUILD123D_VERSION}`]);

console.log("==> Verifying imports");
run(pyBin, [
  "-c",
  "import build123d; import OCP; print('build123d', build123d.__version__, '/ OCP OK')",
]);
console.log(`==> Done. Backend will spawn: ${pyBin}`);
