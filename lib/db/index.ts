import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrateOwnedDatabase } from "./migrate";
import { ownerEmail } from "../auth-config";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as schema from "./schema";

function databasePath() {
  const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
  const dataDirectory = path.join(process.cwd(), "data");
  mkdirSync(dataDirectory, { recursive: true });
  const filename = configured ? path.resolve(configured) : path.join(dataDirectory, "tutor.db");
  mkdirSync(path.dirname(filename), { recursive: true });
  return filename;
}

export const sqlite = new Database(databasePath());
sqlite.pragma("foreign_keys = ON");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });

export async function runMigrations() {
  await migrateOwnedDatabase(sqlite, databasePath(), ownerEmail());
}
