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

    -- Lista „kto co przynosi”
    CREATE TABLE IF NOT EXISTS lists (
      slug          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      organizer_key TEXT NOT NULL,          -- HMAC klucza organizatora
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS list_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      list_slug  TEXT NOT NULL REFERENCES lists(slug) ON DELETE CASCADE,
      title      TEXT NOT NULL,             -- co
      note       TEXT NOT NULL DEFAULT '',  -- np. „na 10 osób”
      who        TEXT,                      -- kto przynosi; NULL = jeszcze potrzebne
      owner_key  TEXT,                      -- HMAC klucza osoby, która wpisała / zgłosiła się
      requested  INTEGER NOT NULL DEFAULT 0,-- 1 = organizator wpisał jako potrzebne
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_list_items_list ON list_items(list_slug);

    -- Listy do Świętego Mikołaja
    CREATE TABLE IF NOT EXISTS mailboxes (
      slug          TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      organizer_key TEXT NOT NULL,          -- HMAC klucza organizatora
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS letters (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      mailbox_slug TEXT NOT NULL REFERENCES mailboxes(slug) ON DELETE CASCADE,
      author       TEXT NOT NULL,           -- od kogo (wpisane przez autora)
      body         TEXT NOT NULL,           -- treść listu
      owner_key    TEXT NOT NULL,           -- HMAC klucza autora
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_letters_mailbox ON letters(mailbox_slug);

    -- Dziennik aktywności gości (kto co robił) — patrz activity.js
    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      at         TEXT NOT NULL DEFAULT (datetime('now')),
      kind       TEXT NOT NULL,             -- np. „wejście”, „dopisanie”, „otwarcie listu”
      area       TEXT NOT NULL,             -- losowanie | lista | skrzynka
      slug       TEXT NOT NULL,
      name       TEXT,                      -- nazwa losowania / listy / skrzynki (zostaje po usunięciu)
      actor      TEXT,                      -- imię wpisane przez gościa (niezweryfikowane)
      details    TEXT NOT NULL DEFAULT '',
      ip         TEXT,
      user_agent TEXT,
      ref_id     INTEGER                    -- np. id otwartego listu
    );
    CREATE INDEX IF NOT EXISTS idx_activity_slug ON activity_log(slug);

    -- Dziennik działań admina (podglądy par, usunięcia) — przeżywa restarty kontenera.
    CREATE TABLE IF NOT EXISTS admin_log (
      id      INTEGER PRIMARY KEY AUTOINCREMENT,
      at      TEXT NOT NULL DEFAULT (datetime('now')),
      action  TEXT NOT NULL,
      details TEXT NOT NULL
    );
  `);
  // Proste migracje: kolumny dodane po pierwszym wdrożeniu tabeli.
  const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
  if (!hasColumn('activity_log', 'ref_id')) db.exec('ALTER TABLE activity_log ADD COLUMN ref_id INTEGER');

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
