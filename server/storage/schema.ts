export const SCHEMA_VERSION = 2;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS revisions (
  rev_id        TEXT PRIMARY KEY,
  parent_rev_id TEXT,
  code          TEXT NOT NULL,
  language      TEXT NOT NULL,
  created_at    INTEGER NOT NULL,
  source        TEXT NOT NULL,
  message       TEXT,
  mesh_blob_id  TEXT,
  label         TEXT
);

CREATE INDEX IF NOT EXISTS idx_revisions_parent  ON revisions(parent_rev_id);
CREATE INDEX IF NOT EXISTS idx_revisions_created ON revisions(created_at);

CREATE TABLE IF NOT EXISTS messages (
  msg_id          TEXT PRIMARY KEY,
  parent_msg_id   TEXT,
  role            TEXT NOT NULL,
  parts_json      TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  produced_rev_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_msg_id);

CREATE TABLE IF NOT EXISTS meshes (
  blob_id        TEXT PRIMARY KEY,
  triangle_count INTEGER NOT NULL,
  positions      BLOB NOT NULL
);
`;
