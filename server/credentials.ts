import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface CredentialStore {
  get(provider: string): string | null;
  set(provider: string, key: string): void;
  has(provider: string): boolean;
  list(): string[];
}

export const SUPPORTED_PROVIDERS = ["openrouter"] as const;
export type ProviderName = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(name: string): boolean {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(name);
}

function credentialsDir(): string {
  return process.env.CADZ_HOME ?? path.join(homedir(), ".cadzero");
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

type CredentialMap = Record<string, { apiKey?: string }>;

function loadCredentials(file: string): CredentialMap {
  return readJsonAtomic<CredentialMap>(file, {});
}

function saveCredentials(file: string, creds: CredentialMap): void {
  writeJsonAtomic(file, creds);
}

export class EnvVarCredentialStore implements CredentialStore {
  private readonly prefix: string;

  constructor(prefix = "CADZ_API_KEY_") {
    this.prefix = prefix;
  }

  get(provider: string): string | null {
    const value = process.env[`${this.prefix}${provider.toUpperCase()}`];
    if (value && value.trim().length > 0) return value.trim();
    // Backwards-compat: OPENROUTER_API_KEY was the original env var.
    if (provider === "openrouter") {
      const legacy = process.env.OPENROUTER_API_KEY;
      if (legacy && legacy.trim().length > 0) return legacy.trim();
    }
    return null;
  }

  set(_provider: string, _key: string): void {
    throw new Error(
      "EnvVarCredentialStore is read-only. Run with a writable credential store (Electron or CADZ_DEV_CREDENTIALS=1) to set API keys from the UI.",
    );
  }

  has(provider: string): boolean {
    return this.get(provider) !== null;
  }

  list(): string[] {
    return SUPPORTED_PROVIDERS.filter((p) => this.has(p));
  }
}

export class FileCredentialStore implements CredentialStore {
  private readonly file: string;

  constructor(fileName = "dev-credentials.json") {
    this.file = path.join(credentialsDir(), fileName);
  }

  private read(): CredentialMap {
    return loadCredentials(this.file);
  }

  private write(creds: CredentialMap): void {
    saveCredentials(this.file, creds);
  }

  get(provider: string): string | null {
    if (!isSupportedProvider(provider)) return null;
    return this.read()[provider]?.apiKey ?? null;
  }

  set(provider: string, key: string): void {
    if (!isSupportedProvider(provider)) {
      throw new Error(`Unsupported provider: ${provider}`);
    }
    const creds = this.read();
    creds[provider] = { apiKey: key };
    this.write(creds);
  }

  has(provider: string): boolean {
    return this.get(provider) !== null;
  }

  list(): string[] {
    const creds = this.read();
    return SUPPORTED_PROVIDERS.filter((p) => Boolean(creds[p]?.apiKey));
  }
}

export function pickStandaloneCredentialStore(): CredentialStore {
  if (process.env.CADZ_DEV_CREDENTIALS === "1" || process.env.CADZ_DEV_CREDENTIALS === "true") {
    return new FileCredentialStore();
  }
  return new EnvVarCredentialStore();
}

export function describeProviderStatus(store: CredentialStore): {
  activeProvider: string | null;
  providers: Record<string, { configured: boolean }>;
} {
  const configured = store.list();
  const providers: Record<string, { configured: boolean }> = {};
  for (const name of SUPPORTED_PROVIDERS) {
    providers[name] = { configured: configured.includes(name) };
  }
  const activeProvider = configured[0] ?? null;
  return { activeProvider, providers };
}
