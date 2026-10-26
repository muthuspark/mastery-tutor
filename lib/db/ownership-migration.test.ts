import Database from "better-sqlite3";
import { mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { migrateOwnedDatabase } from "./migrate";
const directories: string[] = [];
afterEach(() => { for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true }); });
it("backs up existing records, assigns the configured owner, preserves relationships, and reruns safely", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "mastery-owner-")); directories.push(directory);
  const file = path.join(directory, "tutor.db"); const sqlite = new Database(file); sqlite.pragma("foreign_keys = ON");
  const journal = JSON.parse(readFileSync("drizzle/meta/_journal.json", "utf8"));
  sqlite.exec('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)');
  for (const migration of journal.entries.filter((entry: { idx: number }) => entry.idx < 11)) {
    sqlite.exec(readFileSync(`drizzle/${migration.tag}.sql`, "utf8").replaceAll("--> statement-breakpoint", ""));
    sqlite.prepare('INSERT INTO __drizzle_migrations(hash,created_at) VALUES (?,?)').run("fixture", migration.when);
  }
  sqlite.exec(`INSERT INTO courses (id,topic,created_at) VALUES ('legacy-course','Private legacy course',1);
    INSERT INTO chapters(id,course_id,idx,title,objectives,prerequisites,status,created_at) VALUES ('legacy-chapter','legacy-course',0,'Lesson','[]','[]','passed',1);
    INSERT INTO learner_profile(id,about_me,updated_at) VALUES (1,'Owner background',1);
    INSERT INTO attempts(id,chapter_id,attempt_no,score,passed,created_at) VALUES ('attempt','legacy-chapter',1,1,1,1);`);
  try {
    await migrateOwnedDatabase(sqlite, file, "owner@example.com");
    const backups = readdirSync(directory).filter(f => f.endsWith(".bak")); expect(backups).toHaveLength(1);
    const backup = new Database(path.join(directory, backups[0]), { readonly: true });
    expect(backup.prepare('SELECT topic FROM courses').get()).toEqual({ topic: "Private legacy course" });
    expect(backup.prepare("SELECT name FROM sqlite_master WHERE name = 'user'").get()).toBeUndefined(); backup.close();
    const owner = sqlite.prepare('SELECT id,email FROM user').get() as { id: string; email: string };
    expect(owner.email).toBe("owner@example.com");
    expect(sqlite.prepare('SELECT user_id FROM courses').get()).toEqual({ user_id: owner.id });
    expect(sqlite.prepare('SELECT user_id,about_me FROM learner_profile').get()).toEqual({ user_id: owner.id, about_me: "Owner background" });
    expect(sqlite.prepare('SELECT status FROM chapters').get()).toEqual({ status: "passed" });
    expect(sqlite.prepare('SELECT count(*) AS n FROM attempts').get()).toEqual({ n: 1 });
    await migrateOwnedDatabase(sqlite, file, "owner@example.com");
    expect(sqlite.prepare('SELECT count(*) AS n FROM user').get()).toEqual({ n: 1 });
    expect(readdirSync(directory).filter(f => f.endsWith(".bak"))).toHaveLength(1);
    // A later learner cannot acquire pre-existing records through a changed owner setting.
    await migrateOwnedDatabase(sqlite, file, "second@example.com");
    expect(sqlite.prepare('SELECT user_id FROM courses').get()).toEqual({ user_id: owner.id });
    expect(sqlite.pragma("foreign_key_check")).toEqual([]);
  } finally { sqlite.close(); }
});
it("refuses migration without an explicit valid owner before creating auth tables", async () => {
  const sqlite = new Database(":memory:");
  try {
    await expect(migrateOwnedDatabase(sqlite, ":memory:", "")).rejects.toThrow("OWNER_EMAIL");
    expect(sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'user'").get()).toBeUndefined();
  } finally { sqlite.close(); }
});
