import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface AppConfig {
  workspaceRoot: string | null;
}

export interface AppSettings {
  model?: string | null;
  panelSplit?: number;
  viewMode?: string;
  gridVisible?: boolean;
  gizmoVisible?: boolean;
  lastOpenDocIds?: string[];
}

export function configDir(): string {
  return process.env.CADZ_HOME ?? path.join(homedir(), ".cadzero");
}

export function configPath(): string {
  return path.join(configDir(), "config.json");
}

export function getWorkspaceRoot(): string | null {
  const env = process.env.WORKSPACE_DIR;
  if (env && env.trim().length > 0) return env.trim();
  return readAppConfig().workspaceRoot;
}

function readJsonAtomic<T>(file: string, fallback: T): T {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, file);
}

export function readAppConfig(): AppConfig {
  return readJsonAtomic<AppConfig>(configPath(), { workspaceRoot: null });
}

export function writeAppConfig(patch: Partial<AppConfig>): AppConfig {
  const next: AppConfig = { ...readAppConfig(), ...patch };
  writeJsonAtomic(configPath(), next);
  return next;
}

export function settingsPath(): string | null {
  const root = getWorkspaceRoot();
  return root ? path.join(root, ".cadzero", "settings.json") : null;
}

export function readSettings(): AppSettings {
  const file = settingsPath();
  if (!file) return {};
  return readJsonAtomic<AppSettings>(file, {});
}

export function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const file = settingsPath();
  if (!file) throw new Error("No workspace configured");
  const next: AppSettings = { ...readSettings(), ...patch };
  writeJsonAtomic(file, next);
  return next;
}
