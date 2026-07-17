import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema";

const MAX_OPEN = 16;

const openCache = new Map<string, DatabaseType>();

function getVersion(db: DatabaseType): number {
  const row = db
    .prepare("SELECT value FROM meta WHERE key = ?")
    .get("schema_version") as { value?: string } | undefined;
  return row ? Number(row.value) : 0;
}

function setVersion(db: DatabaseType, version: number): void {
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)").run(
    "schema_version",
    String(version),
  );
}

function columnExists(
  db: DatabaseType,
  table: string,
  column: string,
): boolean {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as {
    name: string;
  }[];
  return rows.some((r) => r.name === column);
}

function addColumnIfMissing(
  db: DatabaseType,
  table: string,
  column: string,
  type: string,
): void {
  if (!columnExists(db, table, column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
}

function migrate(db: DatabaseType): void {
  db.exec(SCHEMA_SQL);
  const current = getVersion(db);
  if (current < 2) {
    addColumnIfMissing(db, "revisions", "label", "TEXT");
  }
  if (current < 3) {
    addColumnIfMissing(db, "meshes", "topology_json", "TEXT");
  }
  if (current < SCHEMA_VERSION) {
    setVersion(db, SCHEMA_VERSION);
  }
}

export function openPartDb(filePath: string): DatabaseType {
  const abs = path.resolve(filePath);
  const cached = openCache.get(abs);
  if (cached) {
    openCache.delete(abs);
    openCache.set(abs, cached);
    return cached;
  }

  mkdirSync(path.dirname(abs), { recursive: true });
  const db = new Database(abs);
  db.pragma("journal_mode = DELETE");
  db.pragma("synchronous = NORMAL");
  migrate(db);

  openCache.set(abs, db);
  while (openCache.size > MAX_OPEN) {
    const oldestKey = openCache.keys().next().value;
    if (oldestKey === undefined) break;
    const oldest = openCache.get(oldestKey);
    openCache.delete(oldestKey);
    oldest?.close();
  }
  return db;
}

export function closePartDb(filePath: string): void {
  const abs = path.resolve(filePath);
  const db = openCache.get(abs);
  if (db) {
    openCache.delete(abs);
    void db.close();
  }
}

export function closeAll(): void {
  for (const db of openCache.values()) void db.close();
  openCache.clear();
}
