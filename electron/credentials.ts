import { safeStorage } from "electron";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { CredentialStore } from "../server/credentials";

type CredentialMap = Record<string, { encrypted?: string; plaintext?: string }>;

function credentialsDir(): string {
  return process.env.CADZ_HOME ?? path.join(homedir(), ".cadzero");
}

function credentialsFile(): string {
  return path.join(credentialsDir(), "credentials.json");
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

export class SafeStorageCredentialStore implements CredentialStore {
  private readonly encryptionAvailable: boolean;

  constructor() {
    this.encryptionAvailable = safeStorage.isEncryptionAvailable();
    if (!this.encryptionAvailable) {
      console.warn(
        "[cadzero] OS keychain encryption unavailable (safeStorage). API keys will be stored in PLAINTEXT at " +
          credentialsFile() +
          ". Install libsecret / gnome-keyring to enable encryption.",
      );
    }
  }

  private read(): CredentialMap {
    return readJsonAtomic<CredentialMap>(credentialsFile(), {});
  }

  private write(creds: CredentialMap): void {
    writeJsonAtomic(credentialsFile(), creds);
  }

  get(provider: string): string | null {
    const entry = this.read()[provider];
    if (!entry) return null;
    if (entry.encrypted) {
      if (!this.encryptionAvailable) return null;
      try {
        return safeStorage.decryptString(Buffer.from(entry.encrypted, "base64"));
      } catch {
        return null;
      }
    }
    return entry.plaintext ?? null;
  }

  set(provider: string, key: string): void {
    const creds = this.read();
    if (this.encryptionAvailable) {
      const encrypted = safeStorage.encryptString(key);
      creds[provider] = { encrypted: encrypted.toString("base64") };
    } else {
      creds[provider] = { plaintext: key };
    }
    this.write(creds);
  }

  has(provider: string): boolean {
    return this.get(provider) !== null;
  }

  list(): string[] {
    const creds = this.read();
    const names: string[] = [];
    for (const [name, entry] of Object.entries(creds)) {
      if (entry.encrypted || entry.plaintext) {
        if (this.has(name)) names.push(name);
      }
    }
    return names;
  }
}
