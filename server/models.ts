import { config } from "./env";
import modelsConfigJson from "./models.config.json";

let keyResolver: () => string | null = () => null;

export function setKeyResolver(fn: () => string | null): void {
  keyResolver = fn;
}

interface ModelsConfig {
  default: string;
  models: string[];
}

export interface AvailableModel {
  id: string;
  name: string;
  supportsVision: boolean;
}

interface OpenRouterModel {
  id: string;
  name?: string;
  architecture?: {
    input_modalities?: string[];
  };
}

interface OpenRouterModelsResponse {
  data?: OpenRouterModel[];
}

interface OpenRouterModelInfo {
  name: string;
  supportsVision: boolean;
}

const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { at: number; models: AvailableModel[] } | null = null;
let inflight: Promise<AvailableModel[]> | null = null;

function loadConfig(): ModelsConfig {
  const parsed = modelsConfigJson as ModelsConfig;
  if (
    !parsed ||
    !Array.isArray(parsed.models) ||
    typeof parsed.default !== "string"
  ) {
    throw new Error("Invalid models.config.json: expected { default, models[] }");
  }
  return parsed;
}

async function fetchOpenRouterModels(): Promise<Map<string, OpenRouterModelInfo>> {
  const apiKey = keyResolver();
  if (!apiKey) return new Map();
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    throw new Error(`OpenRouter /models returned ${res.status}`);
  }
  const json = (await res.json()) as OpenRouterModelsResponse;
  const map = new Map<string, OpenRouterModelInfo>();
  for (const m of json.data ?? []) {
    const modalities = m.architecture?.input_modalities ?? [];
    map.set(m.id, {
      name: m.name ?? m.id,
      supportsVision: modalities.some((mod) => mod === "image"),
    });
  }
  return map;
}

export async function listAvailableModels(): Promise<AvailableModel[]> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.models;
  if (inflight) return inflight;

  inflight = (async () => {
    const [cfg, known] = await Promise.all([
      loadConfig(),
      fetchOpenRouterModels().catch(() => new Map<string, OpenRouterModelInfo>()),
    ]);
    const knownIds = new Set(known.keys());
    const models: AvailableModel[] = cfg.models
      .filter((id) => knownIds.size === 0 || knownIds.has(id))
      .map((id) => {
        const info = known.get(id);
        return {
          id,
          name: info?.name ?? id,
          supportsVision: info?.supportsVision ?? false,
        };
      });
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
