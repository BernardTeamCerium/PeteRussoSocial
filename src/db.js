import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS mentions (
  id INTEGER PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  source TEXT NOT NULL,          -- google_news | reddit | youtube | hacker_news | gdelt | web
  title TEXT,
  snippet TEXT,
  author TEXT,
  outlet TEXT,
  published_at TEXT,
  found_at TEXT NOT NULL,
  relevance REAL NOT NULL DEFAULT 0, -- 0..1, how likely this is about OUR Pete Russo
  sentiment REAL NOT NULL DEFAULT 0, -- -1..1
  links_to_site INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'new', -- new | reviewed | flagged | irrelevant
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mentions_published ON mentions(published_at);

CREATE TABLE IF NOT EXISTS social_snapshots (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  date TEXT NOT NULL,             -- YYYY-MM-DD
  followers INTEGER, posts INTEGER, impressions INTEGER, reach INTEGER,
  likes INTEGER, comments INTEGER, shares INTEGER, views INTEGER,
  engagement_rate REAL,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE(platform, date)
);

CREATE TABLE IF NOT EXISTS rankings (
  id INTEGER PRIMARY KEY,
  keyword TEXT NOT NULL,
  date TEXT NOT NULL,
  source TEXT NOT NULL,           -- gsc | serp
  position REAL, clicks INTEGER, impressions INTEGER, ctr REAL,
  url TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE(keyword, date, source)
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL UNIQUE,
  users INTEGER, sessions INTEGER, pageviews INTEGER,
  engaged_sessions INTEGER, avg_session_seconds REAL, conversions INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics_breakdowns (
  id INTEGER PRIMARY KEY,
  period_end TEXT NOT NULL,
  dimension TEXT NOT NULL,        -- channel | page | country | device | referrer
  label TEXT NOT NULL,
  sessions INTEGER, users INTEGER,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE(period_end, dimension, label)
);

CREATE TABLE IF NOT EXISTS site_audits (
  id INTEGER PRIMARY KEY,
  run_at TEXT NOT NULL,
  score INTEGER,
  data TEXT NOT NULL,             -- JSON: checks, pagespeed, etc.
  is_demo INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS share_links (
  token TEXT PRIMARY KEY,
  label TEXT,
  sections TEXT NOT NULL,         -- JSON array
  days INTEGER NOT NULL DEFAULT 30,
  created_at TEXT NOT NULL,
  expires_at TEXT
);

CREATE TABLE IF NOT EXISTS collection_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  results TEXT                    -- JSON per connector: {ok, count, error, demo}
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  detail TEXT,
  category TEXT,
  priority TEXT NOT NULL DEFAULT 'medium',
  done INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
`;

export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  return db;
}

/** Remove demo rows of a table once real data arrives for it. */
export function clearDemo(db, table, where = '') {
  db.prepare(`DELETE FROM ${table} WHERE is_demo = 1 ${where}`).run();
}

export const getMeta = (db, key) => db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
export const setMeta = (db, key, value) => db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
