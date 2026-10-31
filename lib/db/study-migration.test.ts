import { expect, it } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
it("upgrades historical learning records without rewriting them", () => {
  const folder = mkdtempSync(join(tmpdir(), "newton-study-migrate-")),
    sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  try {
    cpSync("drizzle", folder, { recursive: true });
    const journal = JSON.parse(
      readFileSync(join(folder, "meta/_journal.json"), "utf8"),
    );
    journal.entries = journal.entries.filter(
      (entry: { idx: number }) => entry.idx < 13,
    );
    writeFileSync(join(folder, "meta/_journal.json"), JSON.stringify(journal));
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: folder });
    sqlite.exec(`INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('u','Test','test@example.test',1,1,1);
   INSERT INTO courses(id,user_id,topic,created_at,completed_at) VALUES ('c','u','Historical',1,1);
   INSERT INTO chapters(id,course_id,idx,title,objectives,prerequisites,status,created_at) VALUES ('h','c',0,'Old','[]','[]','passed',1);
   INSERT INTO questions(id,chapter_id,type,prompt,options,rubric,model_answer,concept_tag,created_at) VALUES ('q','h','mcq','Old question','["Yes","No"]','Because','Yes','old',1);
   INSERT INTO attempts(id,chapter_id,attempt_no,score,passed,created_at) VALUES ('a','h',1,1,1,1);
   INSERT INTO answers(id,attempt_id,question_id,response,score,feedback,created_at) VALUES ('r','a','q','Yes',1,'Correct',1);`);
    const tables = ["courses", "chapters", "questions", "attempts", "answers"];
    const before = tables.map((t) =>
      sqlite.prepare(`SELECT * FROM ${t}`).all(),
    );
    migrate(db, { migrationsFolder: "drizzle" });
    expect(
      tables.map((t) => sqlite.prepare(`SELECT * FROM ${t}`).all()),
    ).toEqual(before);
    expect(
      sqlite.prepare("SELECT count(*) n FROM concept_review_schedules").get(),
    ).toEqual({ n: 0 });
    expect(
      sqlite.prepare("SELECT count(*) n FROM assessment_sessions").get(),
    ).toEqual({ n: 0 });
  } finally {
    sqlite.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
