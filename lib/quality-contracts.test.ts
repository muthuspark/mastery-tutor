import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { describe, expect, it } from "vitest";
import { coursePlanSchema, reviewSchema, syllabusGraphIssues } from "./quality-contracts";
import { courses } from "./db/schema";

import { samplePlan } from "../test/quality-fixtures";

describe("course quality contracts", () => {
  it("accepts focused plans and rejects impossible or repeated dependencies and titles", () => {
    expect(coursePlanSchema.parse(samplePlan()).chapters).toHaveLength(1);
    for (const prerequisites of [[0], [1], [-1], [0, 0]]) {
      const plan = samplePlan();
      plan.chapters[0].prerequisites = prerequisites;
      expect(coursePlanSchema.safeParse(plan).success).toBe(false);
    }
    expect(syllabusGraphIssues([{ title: "A", prerequisites: [] }, { title: " A ", prerequisites: [0] }])).toContain("Chapter 1: duplicate title");
    expect(syllabusGraphIssues([{ title: "A", prerequisites: [] }, { title: "B", prerequisites: [0] }])).toEqual([]);
  });
  it("bounds planning and requires evidence for review issues", () => {
    const plan = samplePlan();
    expect(coursePlanSchema.safeParse({ ...plan, chapters: [] }).success).toBe(false);
    expect(coursePlanSchema.safeParse({ ...plan, chapters: Array.from({ length: 25 }, (_, idx) => ({ ...plan.chapters[0], title: `Lesson ${idx}` })) }).success).toBe(false);
    expect(reviewSchema.parse({ issues: [] })).toEqual({ issues: [] });
    expect(reviewSchema.safeParse({ issues: [{ severity: "blocking", category: "alignment" }] }).success).toBe(false);
  });
  it("migrates legacy courses with ready state and no invented teaching metadata", () => {
    const sqlite = new Database(":memory:");
    const db = drizzle(sqlite);
    migrate(db, { migrationsFolder: "drizzle" });
    db.insert(courses).values({ id: "legacy", topic: "Old course", createdAt: new Date() }).run();
    expect(db.select().from(courses).get()).toMatchObject({ preparationStatus: "ready", preparationVersion: 1, brief: null, learningRequest: null, qualityPolicyVersion: null });
    sqlite.close();
  });
});
