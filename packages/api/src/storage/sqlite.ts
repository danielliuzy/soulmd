import { createClient, type Client } from "@libsql/client";

export interface SoulRecord {
  id: number;
  slug: string;
  label: string;
  name: string;
  user_id: number;
  description: string | null;
  tags: string;
  rating_avg: number;
  rating_count: number;
  downloads_count: number;
  image_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface SoulWithAuthor extends SoulRecord {
  author: string;
}

export interface UserRecord {
  id: number;
  github_id: number;
  github_username: string;
  avatar_url: string | null;
  created_at: string;
  last_login: string;
}

export interface SoulRatingRecord {
  id: number;
  soul_id: number;
  user_id: number;
  rating: number;
  created_at: string;
}

export async function createDatabase(url?: string, authToken?: string): Promise<Client> {
  const client = createClient({
    url: url ?? "file:local.db",
    authToken,
  });

  await migrate(client);
  return client;
}

async function migrate(client: Client): Promise<void> {
  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      github_id INTEGER UNIQUE NOT NULL,
      github_username TEXT NOT NULL,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS souls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      label TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      user_id INTEGER NOT NULL REFERENCES users(id),
      description TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      rating_avg REAL NOT NULL DEFAULT 0,
      rating_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS soul_ratings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      soul_id INTEGER NOT NULL REFERENCES souls(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(soul_id, user_id)
    );
  `);

  // Migration: add label column to existing databases
  try {
    await client.execute("SELECT label FROM souls LIMIT 0");
  } catch {
    // Column doesn't exist — add it and backfill from slugified name
    await client.execute("ALTER TABLE souls ADD COLUMN label TEXT");
    await client.execute(
      "UPDATE souls SET label = LOWER(REPLACE(REPLACE(TRIM(name), ' ', '-'), '''', '')) WHERE label IS NULL"
    );
    // Deduplicate labels by appending rowid for collisions
    await client.execute(`
      UPDATE souls SET label = label || '-' || id
      WHERE id NOT IN (
        SELECT MIN(id) FROM souls GROUP BY label
      )
    `);
    await client.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_souls_label ON souls(label)");
  }

  // Migration: replace author column with user_id foreign key
  try {
    await client.execute("SELECT user_id FROM souls LIMIT 0");
  } catch {
    await client.execute("ALTER TABLE souls ADD COLUMN user_id INTEGER REFERENCES users(id)");
    await client.execute(`
      UPDATE souls SET user_id = (
        SELECT u.id FROM users u WHERE u.github_username = souls.author
      )
    `);
  }

  // Migration: drop legacy author column
  try {
    await client.execute("SELECT author FROM souls LIMIT 0");
    await client.execute("ALTER TABLE souls DROP COLUMN author");
  } catch {
    // Column already gone — nothing to do
  }

  // Migration: drop version column and soul_versions table
  try {
    await client.execute("SELECT version FROM souls LIMIT 0");
    await client.execute("ALTER TABLE souls DROP COLUMN version");
  } catch {
    // Column already gone — nothing to do
  }
  await client.execute("DROP TABLE IF EXISTS soul_versions");

  // Migration: add downloads_count column
  try {
    await client.execute("SELECT downloads_count FROM souls LIMIT 0");
  } catch {
    await client.execute("ALTER TABLE souls ADD COLUMN downloads_count INTEGER NOT NULL DEFAULT 0");
  }

  // Migration: add image_url column
  try {
    await client.execute("SELECT image_url FROM souls LIMIT 0");
  } catch {
    await client.execute("ALTER TABLE souls ADD COLUMN image_url TEXT");
  }
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function generateLabel(db: Client, name: string): Promise<string> {
  const base = slugify(name);
  const existing = await db.execute({
    sql: "SELECT label FROM souls WHERE label = ? OR label LIKE ?",
    args: [base, `${base}-%`],
  });

  const taken = new Set(existing.rows.map((r) => r.label as string));
  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix++;
  return `${base}-${suffix}`;
}

