import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(new URL("../../drizzle/0010_chapter_explanations.sql", import.meta.url), "utf8")
  .replaceAll("--> statement-breakpoint", "");

function databaseWithPreviousSchema() {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE courses (id text PRIMARY KEY, preparation_version integer NOT NULL DEFAULT 1);
    CREATE TABLE chapters (
      id text PRIMARY KEY,
      course_id text NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      content text,
      pretest text,
      summary text,
      content_generation_version integer NOT NULL DEFAULT 1,
      content_generation_status text NOT NULL DEFAULT 'pending',
      generated_at integer,
      created_at integer NOT NULL DEFAULT 1
    );
    CREATE TABLE chapter_versions (
      chapter_id text NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      generation_version integer NOT NULL,
      content text NOT NULL,
      generated_at integer,
      PRIMARY KEY (chapter_id, generation_version)
    );
    CREATE TABLE questions (id text PRIMARY KEY, chapter_id text NOT NULL REFERENCES chapters(id));
  `);
  return sqlite;
}

describe("chapter explanation migration", () => {
  it("creates the timeline on a fresh database with no imported rows", () => {
    const sqlite = databaseWithPreviousSchema();
    try {
      sqlite.exec(migrationSql);
      expect(sqlite.prepare("SELECT count(*) AS count FROM chapter_explanations").get()).toEqual({ count: 0 });
      expect(sqlite.prepare("PRAGMA table_info(chapters)").all()).toContainEqual(expect.objectContaining({ name: "original_explanation_level" }));
      expect(sqlite.prepare("PRAGMA foreign_key_list(chapter_explanations)").all()).toContainEqual(expect.objectContaining({ table: "chapters", on_delete: "CASCADE" }));
    } finally {
      sqlite.close();
    }
  });

  it("preserves existing chapter history and assessment rows when upgrading", () => {
    const sqlite = databaseWithPreviousSchema();
    try {
      sqlite.exec(`
        INSERT INTO courses (id) VALUES ('course-1');
        INSERT INTO chapters (id, course_id, content, pretest, summary, content_generation_version, content_generation_status, generated_at)
          VALUES ('chapter-1', 'course-1', 'current text', 'predict', 'summary', 3, 'ready', 3000);
        INSERT INTO chapter_versions (chapter_id, generation_version, content, generated_at)
          VALUES ('chapter-1', 2, 'older text', 2000);
        INSERT INTO questions (id, chapter_id) VALUES ('question-1', 'chapter-1');
      `);
      sqlite.exec(migrationSql);

      expect(sqlite.prepare("SELECT content, pretest, summary, content_generation_version, original_explanation_level FROM chapters").get())
        .toEqual({ content: "current text", pretest: "predict", summary: "summary", content_generation_version: 3, original_explanation_level: null });
      expect(sqlite.prepare("SELECT generation_version, content FROM chapter_versions").all()).toEqual([{ generation_version: 2, content: "older text" }]);
      expect(sqlite.prepare("SELECT id FROM questions").all()).toEqual([{ id: "question-1" }]);

      expect(sqlite.prepare("SELECT content, level, ordinal, import_key FROM chapter_explanations ORDER BY ordinal").all()).toEqual([
        { content: "older text", level: null, ordinal: 1, import_key: "chapter-version:2" },
        { content: "current text", level: null, ordinal: 2, import_key: "chapter-current:3" },
      ]);
      expect(() => sqlite.prepare(`INSERT INTO chapter_explanations
        (id, chapter_id, ordinal, kind, source_content_version, source_preparation_version, status, created_at)
        VALUES ('exp-duplicate', 'chapter-1', 1, 'legacy', 3, 1, 'ready', 2)`).run()).toThrow(/UNIQUE/);
    } finally {
      sqlite.close();
    }
  });
});
