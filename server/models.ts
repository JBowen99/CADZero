import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./env";

interface ModelsConfig {
  default: string;
  models: string[];
}

export interface AvailableModel {
  id: string;
  name: string;
}

interface OpenRouterModel {
  id: string;
  name?: string;
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, "models.config.json");

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; models: AvailableModel[] } | null = null;
let inflight: Promise<AvailableModel[]> | null = null;

async function loadConfig(): Promise<ModelsConfig> {
  const raw = await readFile(CONFIG_PATH, "utf8");
  const parsed = JSON.parse(raw) as ModelsConfig;
  if (
    !parsed ||
    !Array.isArray(parsed.models) ||
    typeof parsed.default !== "string"
  ) {
    throw new Error("Invalid models.config.json: expected { default, models[] }");
  }
  return parsed;
}

async function fetchOpenRouterModelNames(): Promise<Map<string, string>> {
  if (!config.openrouterApiKey) return new Map();
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${config.openrouterApiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models returned ${res.status}`);
  }
  const json = (await res.json()) as OpenRouterModelsResponse;
  const map = new Map<string, string>();
  for (const m of json.data ?? []) {
    map.set(m.id, m.name ?? m.id);
  }
  return map;
}

export async function listAvailableModels(): Promise<AvailableModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  if (inflight) return inflight;

  inflight = (async () => {
    const [cfg, known] = await Promise.all([
      loadConfig(),
      fetchOpenRouterModelNames().catch(() => new Map<string, string>()),
    ]);
    const knownIds = new Set(known.keys());
    const models: AvailableModel[] = cfg.models
      .filter((id) => knownIds.size === 0 || knownIds.has(id))
      .map((id) => ({ id, name: known.get(id) ?? id }));
    cache = { at: Date.now(), models };
    inflight = null;
    return models;
  })();

  return inflight;
}

export async function defaultModelId(): Promise<string> {
  const cfg = await loadConfig();
  const available = await listAvailableModels();
  const ids = new Set(available.map((m) => m.id));
  if (ids.has(cfg.default)) return cfg.default;
  return available[0]?.id ?? config.openrouterModel;
}

export async function resolveModelId(requested?: string): Promise<string> {
  if (requested) {
    const available = await listAvailableModels();
    const match = available.find(
      (m) => m.id === requested || m.name === requested,
    );
    if (match) return match.id;
  }
  return defaultModelId();
}
