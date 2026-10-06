import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function databasePath() {
  const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
  const dataDirectory = path.join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  return path.join(dataDirectory, configured ? path.basename(configured) : "tutor.db");
}

const sqlite = new Database(databasePath());
sqlite.pragma("foreign_keys = ON");

export const db = drizzle(sqlite, { schema });

export function runMigrations() {
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}
