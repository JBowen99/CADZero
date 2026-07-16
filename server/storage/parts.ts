import { randomUUID } from "node:crypto";
import { existsSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { Database as DatabaseType } from "better-sqlite3";
import { closePartDb, openPartDb } from "./db";
import type {
  BackendName,
  MessageRecord,
  PartMeta,
  PartSummary,
  PartType,
  RevisionRecord,
  RevisionSource,
  RevisionSummary,
  StoredMesh,
} from "./types";

const CADZ_EXT = ".cadz";

export function partPath(workspaceRoot: string, id: string): string {
  return path.join(workspaceRoot, `${id}${CADZ_EXT}`);
}

export function partExists(workspaceRoot: string, id: string): boolean {
  return existsSync(partPath(workspaceRoot, id));
}

function readMeta(db: DatabaseType): PartMeta | null {
  const rows = db.prepare("SELECT key, value FROM meta").all() as {
    key: string;
    value: string;
  }[];
  if (rows.length === 0) return null;
  const m = new Map(rows.map((r) => [r.key, r.value]));
  const head = m.get("head_rev_id");
  return {
    id: m.get("id") ?? "",
    name: m.get("name") ?? "",
    type: (m.get("type") as PartType) ?? "part",
    language: (m.get("language") as BackendName) ?? "openscad",
    createdAt: Number(m.get("created_at") ?? 0),
    updatedAt: Number(m.get("updated_at") ?? 0),
    headRevId: head && head.length > 0 ? head : null,
  };
}

function setMeta(
  db: DatabaseType,
  key: string,
  value: string | number | null,
): void {
  db.prepare("INSERT OR REPLACE INTO meta(key, value) VALUES(?, ?)").run(
    key,
    value == null ? "" : String(value),
  );
}

function toSummary(meta: PartMeta): PartSummary {
  return meta;
}

export interface CreatePartInput {
  name: string;
  type?: PartType;
  language?: BackendName;
}

export function createPart(
  workspaceRoot: string,
  input: CreatePartInput,
): PartMeta {
  const id = randomUUID();
  const now = Date.now();
  const db = openPartDb(partPath(workspaceRoot, id));
  setMeta(db, "id", id);
  setMeta(db, "name", input.name);
  setMeta(db, "type", input.type ?? "part");
  setMeta(db, "language", input.language ?? "openscad");
  setMeta(db, "created_at", now);
  setMeta(db, "updated_at", now);
  setMeta(db, "head_rev_id", null);
  return {
    id,
    name: input.name,
    type: input.type ?? "part",
    language: input.language ?? "openscad",
    createdAt: now,
    updatedAt: now,
    headRevId: null,
  };
}

export function listParts(workspaceRoot: string): PartSummary[] {
  if (!existsSync(workspaceRoot)) return [];
  const out: PartSummary[] = [];
  for (const entry of readdirSync(workspaceRoot)) {
    if (!entry.endsWith(CADZ_EXT)) continue;
    const id = entry.slice(0, -CADZ_EXT.length);
    const meta = getPart(workspaceRoot, id);
    if (meta) out.push(toSummary(meta));
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt);
}

export function getPart(
  workspaceRoot: string,
  id: string,
): PartMeta | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  return readMeta(db);
}

export function updatePartMeta(
  workspaceRoot: string,
  id: string,
  patch: Partial<Pick<PartMeta, "name" | "type" | "language">>,
): PartMeta | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  if (patch.name !== undefined) setMeta(db, "name", patch.name);
  if (patch.type !== undefined) setMeta(db, "type", patch.type);
  if (patch.language !== undefined) setMeta(db, "language", patch.language);
  setMeta(db, "updated_at", Date.now());
  return readMeta(db);
}

export function deletePart(workspaceRoot: string, id: string): boolean {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return false;
  closePartDb(file);
  unlinkSync(file);
  return true;
}

export interface HeadCode {
  revId: string;
  code: string;
  language: BackendName;
}

export interface HeadWithMesh {
  code: string;
  language: BackendName;
  headRevId: string;
  meshBlobId: string | null;
}

export function getHeadCode(
  workspaceRoot: string,
  id: string,
): HeadCode | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const meta = readMeta(db);
  if (!meta?.headRevId) return null;
  const row = db
    .prepare("SELECT code, language FROM revisions WHERE rev_id = ?")
    .get(meta.headRevId) as { code: string; language: BackendName } | undefined;
  if (!row) return null;
  return { revId: meta.headRevId, code: row.code, language: row.language };
}

export function getHeadWithMesh(
  workspaceRoot: string,
  id: string,
): HeadWithMesh | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const meta = readMeta(db);
  if (!meta?.headRevId) return null;
  const row = db
    .prepare("SELECT code, language, mesh_blob_id FROM revisions WHERE rev_id = ?")
    .get(meta.headRevId) as
    | { code: string; language: BackendName; mesh_blob_id: string | null }
    | undefined;
  if (!row) return null;
  return {
    code: row.code,
    language: row.language,
    headRevId: meta.headRevId,
    meshBlobId: row.mesh_blob_id,
  };
}

export interface CreateRevisionInput {
  code: string;
  language: BackendName;
  source: RevisionSource;
  message?: string | null;
  label?: string | null;
  parentRevId?: string | null;
  mesh?: { positions: number[] | Float32Array; triangleCount: number } | null;
  meshBlobId?: string | null;
}

export function createRevision(
  workspaceRoot: string,
  id: string,
  input: CreateRevisionInput,
): RevisionRecord | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const meta = readMeta(db);
  if (!meta) return null;

  const revId = randomUUID();
  const parentRevId = input.parentRevId ?? meta.headRevId;
  const now = Date.now();
  const meshBlobId =
    input.meshBlobId ?? (input.mesh ? storeMeshBlob(db, input.mesh) : null);

  db.prepare(
    `INSERT INTO revisions(rev_id, parent_rev_id, code, language, created_at, source, message, mesh_blob_id, label)
     VALUES(?,?,?,?,?,?,?,?,?)`,
  ).run(
    revId,
    parentRevId,
    input.code,
    input.language,
    now,
    input.source,
    input.message ?? null,
    meshBlobId,
    input.label ?? null,
  );

  setMeta(db, "head_rev_id", revId);
  setMeta(db, "updated_at", now);

  return {
    revId,
    parentRevId,
    code: input.code,
    language: input.language,
    createdAt: now,
    source: input.source,
    message: input.message ?? null,
    meshBlobId,
    label: input.label ?? null,
  };
}

interface RevisionRow {
  rev_id: string;
  parent_rev_id: string | null;
  code: string;
  language: BackendName;
  created_at: number;
  source: RevisionSource;
  message: string | null;
  mesh_blob_id: string | null;
  label: string | null;
}

function rowToRevision(row: RevisionRow): RevisionRecord {
  return {
    revId: row.rev_id,
    parentRevId: row.parent_rev_id,
    code: row.code,
    language: row.language,
    createdAt: row.created_at,
    source: row.source,
    message: row.message,
    meshBlobId: row.mesh_blob_id,
    label: row.label,
  };
}

export function listRevisions(
  workspaceRoot: string,
  id: string,
): RevisionRecord[] {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return [];
  const db = openPartDb(file);
  const rows = db
    .prepare("SELECT * FROM revisions ORDER BY created_at DESC")
    .all() as RevisionRow[];
  return rows.map(rowToRevision);
}

export function getRevision(
  workspaceRoot: string,
  id: string,
  revId: string,
): RevisionRecord | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const row = db
    .prepare("SELECT * FROM revisions WHERE rev_id = ?")
    .get(revId) as RevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export function listRevisionSummaries(
  workspaceRoot: string,
  id: string,
): RevisionSummary[] {
  return listRevisions(workspaceRoot, id).map(({ code: _code, ...rest }) => rest);
}

export function setRevisionLabel(
  workspaceRoot: string,
  id: string,
  revId: string,
  label: string | null,
): RevisionRecord | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const res = db
    .prepare("UPDATE revisions SET label = ? WHERE rev_id = ?")
    .run(label, revId);
  if (res.changes === 0) return null;
  const row = db
    .prepare("SELECT * FROM revisions WHERE rev_id = ?")
    .get(revId) as RevisionRow | undefined;
  return row ? rowToRevision(row) : null;
}

export function restoreRevision(
  workspaceRoot: string,
  id: string,
  revId: string,
): RevisionRecord | null {
  const source = getRevision(workspaceRoot, id, revId);
  if (!source) return null;
  return createRevision(workspaceRoot, id, {
    code: source.code,
    language: source.language,
    source: "fork",
    message: `Restored from revision ${revId.slice(0, 8)}`,
    parentRevId: revId,
    meshBlobId: source.meshBlobId,
  });
}

export function checkpoint(
  workspaceRoot: string,
  id: string,
  label: string,
): RevisionRecord | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const meta = readMeta(db);
  if (!meta?.headRevId) return null;
  const updated = setRevisionLabel(workspaceRoot, id, meta.headRevId, label);
  if (updated) {
    setMeta(db, "updated_at", Date.now());
  }
  return updated;
}

export function storeMeshBlob(
  db: DatabaseType,
  mesh: { positions: number[] | Float32Array; triangleCount: number },
): string {
  const blobId = randomUUID();
  const arr =
    mesh.positions instanceof Float32Array
      ? mesh.positions
      : Float32Array.from(mesh.positions);
  const buf = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  db.prepare(
    "INSERT INTO meshes(blob_id, triangle_count, positions) VALUES(?,?,?)",
  ).run(blobId, mesh.triangleCount, buf);
  return blobId;
}

export function getMeshBlob(
  workspaceRoot: string,
  id: string,
  blobId: string,
): StoredMesh | null {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return null;
  const db = openPartDb(file);
  const row = db
    .prepare(
      "SELECT triangle_count AS triangleCount, positions AS positions FROM meshes WHERE blob_id = ?",
    )
    .get(blobId) as { triangleCount: number; positions: Buffer } | undefined;
  if (!row) return null;
  return { triangleCount: row.triangleCount, positions: row.positions };
}

export function listMessages(
  workspaceRoot: string,
  id: string,
): MessageRecord[] {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return [];
  const db = openPartDb(file);
  const rows = db
    .prepare("SELECT * FROM messages ORDER BY created_at ASC")
    .all() as {
    msg_id: string;
    parent_msg_id: string | null;
    role: "user" | "assistant";
    parts_json: string;
    created_at: number;
    produced_rev_id: string | null;
  }[];
  return rows.map((r) => ({
    msgId: r.msg_id,
    parentMsgId: r.parent_msg_id,
    role: r.role,
    partsJson: r.parts_json,
    createdAt: r.created_at,
    producedRevId: r.produced_rev_id,
  }));
}

export interface UpsertMessageInput {
  msgId: string;
  parentMsgId?: string | null;
  role: "user" | "assistant";
  partsJson: string;
  createdAt?: number;
  producedRevId?: string | null;
}

export function upsertMessage(
  workspaceRoot: string,
  id: string,
  input: UpsertMessageInput,
): void {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return;
  const db = openPartDb(file);
  db.prepare(
    `INSERT INTO messages(msg_id, parent_msg_id, role, parts_json, created_at, produced_rev_id)
     VALUES(?,?,?,?,?,?)
     ON CONFLICT(msg_id) DO UPDATE SET
       parent_msg_id=excluded.parent_msg_id,
       role=excluded.role,
       parts_json=excluded.parts_json,
       produced_rev_id=excluded.produced_rev_id`,
  ).run(
    input.msgId,
    input.parentMsgId ?? null,
    input.role,
    input.partsJson,
    input.createdAt ?? Date.now(),
    input.producedRevId ?? null,
  );
}

export interface BatchMessageInput {
  msgId: string;
  role: "user" | "assistant";
  partsJson: string;
  createdAt?: number;
  producedRevId?: string | null;
}

export function upsertMessageBatch(
  workspaceRoot: string,
  id: string,
  msgs: BatchMessageInput[],
): void {
  const file = partPath(workspaceRoot, id);
  if (!existsSync(file)) return;
  const db = openPartDb(file);
  const ids = msgs.map((m) => m.msgId);
  const upsert = db.transaction(() => {
    if (ids.length === 0) {
      db.prepare("DELETE FROM messages").run();
      return;
    }
    const placeholders = ids.map(() => "?").join(",");
    db.prepare(
      `DELETE FROM messages WHERE msg_id NOT IN (${placeholders})`,
    ).run(...ids);
    let parent: string | null = null;
    for (const m of msgs) {
      db.prepare(
        `INSERT INTO messages(msg_id, parent_msg_id, role, parts_json, created_at, produced_rev_id)
         VALUES(?,?,?,?,?,?)
         ON CONFLICT(msg_id) DO UPDATE SET
           parent_msg_id=excluded.parent_msg_id,
           role=excluded.role,
           parts_json=excluded.parts_json,
           produced_rev_id=excluded.produced_rev_id`,
      ).run(
        m.msgId,
        parent,
        m.role,
        m.partsJson,
        m.createdAt ?? Date.now(),
        m.producedRevId ?? null,
      );
      parent = m.msgId;
    }
  });
  upsert();
}
