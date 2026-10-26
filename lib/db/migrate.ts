import { chmodSync } from "node:fs";
import type Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { readMigrationFiles } from "drizzle-orm/migrator";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { normalizeEmail } from "../auth-config";

export async function migrateOwnedDatabase(sqlite: Database.Database, databaseFile: string, email: string) {
  email = normalizeEmail(email);
  if (!email || !z.email().safeParse(email).success) throw new Error("Configure OWNER_EMAIL before migration.");
  const db = drizzle(sqlite);
  const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  const counts = new Map(tables.filter(({ name }) => name !== "__drizzle_migrations").map(({ name }) => [name, (sqlite.prepare(`SELECT count(*) AS n FROM "${name}"`).get() as { n: number }).n]));
  const needsOwnership = !tables.some(({ name }) => name === "user") || !!sqlite.prepare("SELECT 1 FROM courses WHERE user_id IS NULL LIMIT 1").get();
  const migrationsFolder = path.resolve(process.cwd(), "drizzle");
  const lastMigration = tables.some(({ name }) => name === "__drizzle_migrations")
    ? (sqlite.prepare("SELECT max(created_at) AS timestamp FROM __drizzle_migrations").get() as { timestamp: number | null }).timestamp ?? 0 : 0;
  const pendingMigration = readMigrationFiles({ migrationsFolder }).some(migration => migration.folderMillis > lastMigration);
  if (tables.length && (needsOwnership || pendingMigration)) {
    const backup = `${databaseFile}.before-login-${Date.now()}.bak`;
    await sqlite.backup(backup);
    chmodSync(backup, 0o600);
    console.log(`Database backup saved: ${backup}`);
  }
  migrate(db, { migrationsFolder });
  sqlite.transaction(() => {
    const existing = sqlite.prepare('SELECT id FROM user WHERE email = ?').get(email) as { id: string } | undefined;
    const ownerId = existing?.id ?? `owner-${createHash("sha256").update(email).digest("hex").slice(0, 32)}`;
    const now = Date.now();
    sqlite.prepare('INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?) ON CONFLICT(email) DO NOTHING').run(ownerId, "", email, now, now);
    sqlite.prepare('UPDATE courses SET user_id = ? WHERE user_id IS NULL').run(ownerId);
    sqlite.prepare('UPDATE learner_profile SET user_id = ? WHERE user_id IS NULL').run(ownerId);
    for (const [table, before] of counts) {
      // The migration may add the configured owner, but must preserve every learning record.
      if (["user", "auth_events", "auth_limits", "session", "verification", "account"].includes(table)) continue;
      const after = (sqlite.prepare(`SELECT count(*) AS n FROM "${table}"`).get() as { n: number }).n;
      if (before !== after) throw new Error(`Migration record count mismatch in ${table}`);
    }
    if ((sqlite.pragma("foreign_key_check") as unknown[]).length) throw new Error("Migration failed relationship validation");
  }).immediate();
}
