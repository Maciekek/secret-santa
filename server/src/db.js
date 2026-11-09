import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function openDb(dbPath) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS draws (
      slug          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      organizer_key TEXT NOT NULL,          -- HMAC klucza organizatora
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS participants (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      draw_slug  TEXT NOT NULL REFERENCES draws(slug) ON DELETE CASCADE,
      name       TEXT NOT NULL,
      target_enc TEXT,                      -- zaszyfrowane id osoby obdarowanej
      drawn_at   TEXT,
      UNIQUE (draw_slug, name COLLATE NOCASE)
    );

    CREATE INDEX IF NOT EXISTS idx_participants_draw ON participants(draw_slug);
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
