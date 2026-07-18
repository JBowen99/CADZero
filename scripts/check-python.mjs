#!/usr/bin/env node
/**
 * Pre-package gate: ensure the host Build123D Python runtime exists.
 * Paths match scripts/setup-python.mjs and server/backends/build123d.ts.
 */

import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TARGET_DIR = join(REPO_ROOT, "server", "python");
const pyBin =
  process.platform === "win32"
    ? join(TARGET_DIR, "python.exe")
    : join(TARGET_DIR, "bin", "python3");

if (!existsSync(pyBin)) {
  console.error(
    `ERROR: ${pyBin} not found. Run pnpm setup:python first ` +
      `(on the same OS you are packaging for).`,
  );
  process.exit(1);
}
