import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./db/schema";
it("serializes issue and identical submit races across independent processes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "newton-study-race-")),
    filename = join(directory, "test.db");
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  const now = new Date();
  db.insert(schema.user)
    .values({
      id: "learner",
      name: "Test",
      email: "race@example.test",
      createdAt: now,
      updatedAt: now,
    })
    .run();
  db.insert(schema.courses)
    .values({ id: "c", userId: "learner", topic: "Test", createdAt: now })
    .run();
  db.insert(schema.chapters)
    .values({
      id: "h",
      courseId: "c",
      idx: 0,
      title: "Test",
      status: "passed",
      objectives: [],
      prerequisites: [],
      createdAt: now,
    })
    .run();
  db.insert(schema.questions)
    .values(
      Array.from({ length: 5 }, (_, i) => ({
        id: randomUUID(),
        chapterId: "h",
        type: "mcq" as const,
        prompt: `Question ${i}`,
        options: ["Yes", "No"],
        modelAnswer: "Yes",
        rubric: "Because",
        conceptTag: `concept${i}`,
        createdAt: now,
      })),
    )
    .run();
  const run = (source: string) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [
          "--conditions=react-server",
          "--import",
          "tsx",
          "--eval",
          `const Module=require("node:module");const load=Module._load;Module._load=function(id,...args){if(id==="server-only")return {};if(id==="@/lib/access")return {authorize:async()=>({user:{id:"learner"}})};return load.call(this,id,...args);};${source}`,
        ],
        { cwd: process.cwd(), env: { ...process.env, DATABASE_URL: filename } },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (x) => (stdout += x));
      child.stderr.on("data", (x) => (stderr += x));
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)),
      );
    });
  try {
    const setup = `const s=require('./lib/study-store.ts');s.setupStudy('learner','UTC');console.log(JSON.stringify(s.issueReview('learner')));`;
    const issued = await Promise.all([run(setup), run(setup)]);
    const first = JSON.parse(issued[0]),
      second = JSON.parse(issued[1]);
    expect(first.id).toBe(second.id);
    const source = `const s=require('./lib/study-store.ts');console.log(JSON.stringify(s.submitReview('learner',${JSON.stringify(first.id)},${JSON.stringify(first.questions.map((q: { id: string }) => ({ questionId: q.id, selectedOptionIndex: 0 })))})));`;
    const result = await Promise.all([run(source), run(source)]);
    expect(JSON.parse(result[0])).toEqual(JSON.parse(result[1]));
    expect(db.select().from(schema.studyReviewEvents).all()).toHaveLength(5);
    expect(db.select().from(schema.studyReviewSessions).all()).toHaveLength(1);
    const chapterSetup = `const {db}=require('./lib/db');const schema=require('./lib/db/schema');const a=require('./lib/assessment-sessions');console.log(JSON.stringify(a.issueAssessment('learner','h',db.select().from(schema.questions).all())));`;
    const chapterIssued = await Promise.all([run(chapterSetup),run(chapterSetup)]);
    const assessment=JSON.parse(chapterIssued[0]);expect(JSON.parse(chapterIssued[1]).id).toBe(assessment.id);
    const chapterSubmit = `const {POST}=require('./app/api/chapters/[id]/attempts/route');POST(new Request('http://localhost',{method:'POST',body:JSON.stringify({assessmentId:${JSON.stringify(assessment.id)},answers:${JSON.stringify(assessment.snapshot.questions.map((q:{id:string})=>({questionId:q.id,response:"Yes"})))}})}),{params:Promise.resolve({id:'h'})}).then(async response=>console.log(JSON.stringify({status:response.status,result:await response.json()})));`;
    const chapterResults = await Promise.all([run(chapterSubmit),run(chapterSubmit)]);
    expect(JSON.parse(chapterResults[0])).toEqual(JSON.parse(chapterResults[1]));expect(JSON.parse(chapterResults[0]).status).toBe(200);
    expect(db.select().from(schema.attempts).all()).toHaveLength(1);
    expect(db.select().from(schema.studyReviewEvents).all()).toHaveLength(10);
    // Race a new issued chapter attempt against a frozen review of the same concepts.
    db.run("UPDATE concept_review_schedules SET due_date='2000-01-01'");
    const competing=JSON.parse(await run(`const s=require('./lib/study-store');console.log(JSON.stringify(s.issueReview('learner')));`));
    const nextAssessment=JSON.parse(await run(chapterSetup));
    const newChapterSubmit=chapterSubmit.replaceAll(assessment.id,nextAssessment.id);
    const reviewSubmit=`const s=require('./lib/study-store');try{console.log(JSON.stringify({status:200,result:s.submitReview('learner',${JSON.stringify(competing.id)},${JSON.stringify(competing.questions.map((q:{id:string})=>({questionId:q.id,selectedOptionIndex:0})))} )}));}catch(error){console.log(JSON.stringify({status:error.status}));}`;
    const mixed=await Promise.all([run(newChapterSubmit),run(reviewSubmit)]);
    expect(JSON.parse(mixed[0]).status).toBe(200);expect([200,409]).toContain(JSON.parse(mixed[1]).status);
    expect(db.select().from(schema.attempts).all()).toHaveLength(2);
    expect(db.select().from(schema.studyReviewEvents).all()).toHaveLength(JSON.parse(mixed[1]).status===200?20:15);
    const beforeConflict=db.select().from(schema.studyReviewEvents).all().length;
    const conflictingAssessment=JSON.parse(await run(chapterSetup));
    const correctSubmit=chapterSubmit.replaceAll(assessment.id,conflictingAssessment.id);
    const incorrectSubmit=correctSubmit.replaceAll('"response":"Yes"','"response":"No"');
    const conflict=await Promise.all([run(correctSubmit),run(incorrectSubmit)]);
    expect(conflict.map(value=>JSON.parse(value).status).sort()).toEqual([200,409]);
    expect(db.select().from(schema.attempts).all()).toHaveLength(3);
    expect(db.select().from(schema.studyReviewEvents).all()).toHaveLength(beforeConflict+5);


  } finally {
    sqlite.close();
    rmSync(directory, { recursive: true, force: true });
  }
}, 20000);
