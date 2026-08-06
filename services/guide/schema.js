const db = require('../db');

let ensured = false;

async function ensureTables() {
  if (ensured) return;

  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_categories (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      image TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_articles (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL REFERENCES guide_categories(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT,
      image TEXT,
      body TEXT NOT NULL DEFAULT '',
      position INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_hot_picks (
      category_id TEXT NOT NULL,
      article_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (category_id, article_id)
    );
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS guide_view_tracks (
      id SERIAL PRIMARY KEY,
      category_id TEXT,
      article_id TEXT,
      session_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  ensured = true;
}

function randomId(prefix) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

module.exports = { ensureTables, randomId };
