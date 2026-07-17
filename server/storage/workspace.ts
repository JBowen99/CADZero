import { accessSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { getWorkspaceRoot, writeAppConfig } from "./config";
import { listParts } from "./parts";

export { getWorkspaceRoot };

export class WorkspaceError extends Error {}

function expandTilde(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return path.join(homedir(), p.slice(2));
  return p;
}

export function requireWorkspaceRoot(): string {
  const root = getWorkspaceRoot();
  if (!root) throw new WorkspaceError("No workspace configured");
  return root;
}

export function setWorkspaceRoot(root: string): string {
  const abs = path.resolve(expandTilde(root));
  mkdirSync(abs, { recursive: true });
  accessSync(abs);
  const envWorkspace = process.env.WORKSPACE_DIR?.trim();
  if (envWorkspace && envWorkspace.length > 0) {
    return abs;
  }
  writeAppConfig({ workspaceRoot: abs });
  return abs;
}

export function listWorkspaceParts() {
  const root = getWorkspaceRoot();
  return root ? listParts(root) : [];
}
