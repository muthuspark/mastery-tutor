import { runAgentObject, agentForRequest } from "./agent";
import { invalidateStudySource } from "./study-invalidation";
import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/agent", () => ({ runAgentObject: vi.fn(() => { throw new Error("Unexpected AI call"); }), agentForRequest: vi.fn(() => { throw new Error("Unexpected provider discovery"); }) }));
vi.mock("@/lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("./db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
import { eq } from "drizzle-orm";
import { db } from "./db";
import {
  answers,
  attempts,
  chapters,
  courses,
  questions,
  user,
  reviewItems,
  conceptReviewSchedules,
  studyPreferences,
  studyReviewEvents,
} from "./db/schema";
import {
  applyStudyObservation,
  setupStudy,
  todayStudy,
  issueReview,
  submitReview,
  loadReview,
} from "./study-store";
const now = new Date("2026-10-31T08:00:00Z");
beforeEach(() => {
  db.delete(courses).run();
  db.delete(user).run();
  db.insert(user)
    .values(
      ["a", "b"].map((id) => ({
        id,
        name: id,
        email: `${id}@test.local`,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
  db.insert(courses)
    .values({
      id: "course",
      userId: "a",
      topic: "Probability",
      createdAt: now,
      completedAt: now,
    })
    .run();
  db.insert(chapters)
    .values({
      id: "chapter",
      courseId: "course",
      idx: 0,
      title: "Events",
      status: "passed",
      objectives: [],
      prerequisites: [],
      createdAt: now,
    })
    .run();
  db.insert(questions)
    .values(
      Array.from({ length: 7 }, (_, i) => ({
        id: `q${i}`,
        chapterId: "chapter",
        type: "mcq" as const,
        prompt: `Question ${i}`,
        options: ["Yes", "No", "Maybe", "Unknown"],
        modelAnswer: "Yes",
        rubric: "Because",
        conceptTag: `concept ${i}`,
        createdAt: now,
      })),
    )
    .run();
});
describe("calendar setup", () => {
  it("seeds once without modifying existing progress or inventing evidence", () => {
    db.insert(attempts)
      .values({
        id: "old",
        chapterId: "chapter",
        attemptNo: 1,
        score: 1,
        passed: true,
        createdAt: now,
      })
      .run();
    db.insert(answers)
      .values({
        id: "old-answer",
        attemptId: "old",
        questionId: "q0",
        response: "Yes",
        score: 1,
        feedback: "Correct",
        createdAt: now,
      })
      .run();
    const before = {
      courses: db.select().from(courses).all(),
      chapters: db.select().from(chapters).all(),
      attempts: db.select().from(attempts).all(),
      answers: db.select().from(answers).all(),
    };
    setupStudy("a", "Asia/Kolkata", now);
    setupStudy("a", "Asia/Kolkata", now);
    expect(db.select().from(conceptReviewSchedules).all()).toHaveLength(7);
    expect(db.select().from(studyReviewEvents).all()).toEqual([]);
    expect(
      db
        .select()
        .from(conceptReviewSchedules)
        .all()
        .every((s) => s.lastObservedAt === null && s.dueDate === "2026-10-31"),
    ).toBe(true);
    expect({
      courses: db.select().from(courses).all(),
      chapters: db.select().from(chapters).all(),
      attempts: db.select().from(attempts).all(),
      answers: db.select().from(answers).all(),
    }).toEqual(before);
  });
  it("isolates another learner and rejects invalid zones without writes", () => {
    setupStudy("b", "UTC", now);
    expect(db.select().from(conceptReviewSchedules).all()).toEqual([]);
    expect(() => setupStudy("a", "invalid", now)).toThrow();
    expect(db.select().from(studyPreferences).all()).toHaveLength(1);
  });
});

it("seeds open-chapter misses but skips invalid saved questions", () => {
  db.update(chapters)
    .set({ status: "open" })
    .where(eq(chapters.id, "chapter"))
    .run();
  db.insert(reviewItems)
    .values({
      id: "miss",
      courseId: "course",
      conceptTag: "concept 0",
      sourceQuestionId: "q0",
      dueAfterChapterIdx: 1,
      createdAt: now,
    })
    .run();
  setupStudy("a", "UTC", now);
  expect(db.select().from(conceptReviewSchedules).all()).toMatchObject([
    { sourceQuestionId: "q0", lastOutcome: "incorrect" },
  ]);
});
it("does not seed ambiguous or unsupported questions", () => {
  db.update(questions)
    .set({ options: ["Yes", "Yes"] })
    .where(eq(questions.id, "q0"))
    .run();
  setupStudy("a", "UTC", now);
  expect(db.select().from(conceptReviewSchedules).all()).toHaveLength(6);
});

it("computes bounded factual read-only recommendations for completed courses", () => {
  setupStudy("a", "UTC", now);
  const before = db.select().from(conceptReviewSchedules).all();
  const today = todayStudy("a", new Date("2026-11-03T08:00:00Z"));
  expect(today.dueCount).toBe(7);
  expect(today.items).toHaveLength(5);
  expect(today.items[0].reason).toContain("Overdue by 3 days");
  expect(today.nextLesson).toBeNull();
  expect(db.select().from(conceptReviewSchedules).all()).toEqual(before);
  expect(todayStudy("b", now).dueCount).toBe(0);
});
it("reports unsupported concepts without starving valid ones", () => {
  db.update(questions)
    .set({ options: ["Yes", "Yes"] })
    .where(eq(questions.id, "q0"))
    .run();
  setupStudy("a", "UTC", now);
  expect(todayStudy("a", now)).toMatchObject({
    dueCount: 6,
    unavailableCount: 1,
  });
});

it("issues a stable private batch, grades without progress mutations and replays once", () => {
  setupStudy("a", "UTC", now);
  const before = db.select().from(chapters).all(),
    courseBefore = db.select().from(courses).all();
  const review = issueReview("a", now);
  expect(issueReview("a", now).id).toBe(review.id);
  expect(review.questions).toHaveLength(5);
  expect(review.questions[0]).not.toHaveProperty("modelAnswer");
  const answers = review.questions.map((q) => ({
    questionId: q.id,
    selectedOptionIndex: 0,
  }));
  const result = submitReview("a", review.id, answers, now);
  expect(submitReview("a", review.id, answers, now)).toEqual(result);
  expect(db.select().from(studyReviewEvents).all()).toHaveLength(5);
  expect(db.select().from(chapters).all()).toEqual(before);
  expect(db.select().from(courses).all()).toEqual(courseBefore);
  expect(db.select().from(attempts).all()).toEqual([]);
  expect(todayStudy("a", now).dueCount).toBe(2);
  expect(result.answers.every((a) => a.dueDate === "2026-11-03")).toBe(true);
  expect(() =>
    submitReview(
      "a",
      review.id,
      answers.map((a) => ({ ...a, selectedOptionIndex: 1 })),
      now,
    ),
  ).toThrow(/different/);
});
it("rejects incomplete, duplicate, foreign, stale and invalid review answers without writes", () => {
  setupStudy("a", "UTC", now);
  const review = issueReview("a", now),
    answers = review.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: 0,
    }));
  expect(() => loadReview("b", review.id)).toThrow(/unavailable/);
  expect(() => submitReview("a", review.id, answers.slice(1), now)).toThrow();
  expect(() =>
    submitReview(
      "a",
      review.id,
      answers.map(() => answers[0]),
      now,
    ),
  ).toThrow();
  expect(() =>
    submitReview(
      "a",
      review.id,
      answers.map((a) => ({ ...a, selectedOptionIndex: 5 })),
      now,
    ),
  ).toThrow();
  db.update(questions)
    .set({ prompt: "Changed" })
    .where(eq(questions.id, answers[0].questionId))
    .run();
  expect(() => submitReview("a", review.id, answers, now)).toThrow(/changed/);
  expect(db.select().from(studyReviewEvents).all()).toEqual([]);
});
it("rolls back all review changes on persistence failure", () => {
  setupStudy("a", "UTC", now);
  const review = issueReview("a", now),
    answers = review.questions.map((q) => ({
      questionId: q.id,
      selectedOptionIndex: 0,
    }));
  const before = db.select().from(conceptReviewSchedules).all();
  db.run(
    "CREATE TRIGGER fail_event BEFORE INSERT ON study_review_events BEGIN SELECT RAISE(ABORT, 'fixture failure'); END",
  );
  try {
    expect(() => submitReview("a", review.id, answers, now)).toThrow();
    expect(db.select().from(conceptReviewSchedules).all()).toEqual(before);
  } finally {
    db.run("DROP TRIGGER fail_event");
  }
  expect(submitReview("a", review.id, answers, now).answers).toHaveLength(5);
});

it("suspends reset sources and deletes cross-source snapshots on course deletion", () => {
  setupStudy("a", "UTC", now);
  const review = issueReview("a", now);
  db.transaction((tx) => invalidateStudySource(tx, "chapter"));
  expect(() => loadReview("a", review.id)).toThrow(/changed/);
  expect(todayStudy("a", now).dueCount).toBe(0);
  expect(todayStudy("a", now).unavailableCount).toBe(7);
  db.delete(courses).where(eq(courses.id, "course")).run();
  expect(() => loadReview("a", review.id)).toThrow(/unavailable/);
});
it("zone changes preserve due labels and invalidate an open batch", () => {
  setupStudy("a", "UTC", now);
  const review = issueReview("a", now),
    before = db.select().from(conceptReviewSchedules).all();
  setupStudy("a", "Asia/Kolkata", now);
  expect(db.select().from(conceptReviewSchedules).all()).toEqual(before);
  expect(() => loadReview("a", review.id)).toThrow(/changed/);
});

it("reactivates suspended concepts only from a new accepted source observation", () => {
  setupStudy("a", "UTC", now);
  db.transaction(tx => invalidateStudySource(tx, "chapter"));
  expect(todayStudy("a", now).dueCount).toBe(0);
  const question = db.select().from(questions).where(eq(questions.id, "q0")).get()!;
  db.transaction(tx => applyStudyObservation(tx, "a", { ...question, sourceVersion: 1, preparationVersion: 1 }, true, "chapter", "fresh-assessment", now));
  expect(todayStudy("a", now).dueCount).toBe(1);
  expect(db.select().from(studyReviewEvents).all()).toHaveLength(1);
});

it("never invokes an AI provider for setup, recommendations, review issuance or grading", () => {
 setupStudy("a", "UTC", now);todayStudy("a",now);const review=issueReview("a",now);
 submitReview("a",review.id,review.questions.map(q=>({questionId:q.id,selectedOptionIndex:0})),now);
 expect(runAgentObject).not.toHaveBeenCalled();expect(agentForRequest).not.toHaveBeenCalled();
});

it("keeps same-named concepts separate across courses and cleans mixed snapshots on deletion", () => {
  db.insert(courses).values({ id:"other-course", userId:"a", topic:"Other", createdAt:now }).run();
  db.insert(chapters).values({ id:"other-chapter", courseId:"other-course", idx:0, title:"Other", status:"passed", objectives:[], prerequisites:[], createdAt:now }).run();
  db.insert(questions).values({ id:"other-question", chapterId:"other-chapter", type:"mcq", prompt:"Other concept", options:["Yes","No"], modelAnswer:"Yes", rubric:"Because", conceptTag:"concept 0", createdAt:now }).run();
  setupStudy("a","UTC",now);
  expect(db.select().from(conceptReviewSchedules).all()).toHaveLength(8);
  db.update(conceptReviewSchedules).set({dueDate:"2000-01-01"}).where(eq(conceptReviewSchedules.courseId,"other-course")).run();
  const batch=issueReview("a",now);expect(batch.questions.some(q=>q.course==="Other")).toBe(true);
  db.delete(courses).where(eq(courses.id,"other-course")).run();
  expect(()=>loadReview("a",batch.id)).toThrow(/unavailable/);
  expect(db.select().from(conceptReviewSchedules).all()).toHaveLength(7);
});

it("schedules an overnight batch from the actual submission date", () => {
 setupStudy("a","UTC",now);const batch=issueReview("a",new Date("2026-10-31T23:59:00Z"));
 const result=submitReview("a",batch.id,batch.questions.map(q=>({questionId:q.id,selectedOptionIndex:0})),new Date("2026-11-01T00:01:00Z"));
 expect(result.answers.every(a=>a.dueDate==="2026-11-04")).toBe(true);
});
it("keeps completion unchanged after incorrect standalone review", () => {
 setupStudy("a","UTC",now);const batch=issueReview("a",now),before=db.select().from(courses).all();
 const result=submitReview("a",batch.id,batch.questions.map(q=>({questionId:q.id,selectedOptionIndex:1})),now);
 expect(result.answers.every(a=>!a.correct&&a.dueDate==="2026-11-01")).toBe(true);
 expect(db.select().from(courses).all()).toEqual(before);expect(db.select().from(chapters).all()[0].status).toBe("passed");expect(db.select().from(attempts).all()).toEqual([]);
});
it("does not claim the last answer was a miss after a correct same-day observation", () => {
 setupStudy("a","UTC",now);const question=db.select().from(questions).where(eq(questions.id,"q0")).get()!;
 for(const [id,correct] of [["miss",false],["correct",true]] as const)db.transaction(tx=>applyStudyObservation(tx,"a",{...question,sourceVersion:1,preparationVersion:1},correct,"chapter",id,now));
 const schedule=db.select().from(conceptReviewSchedules).where(eq(conceptReviewSchedules.sourceQuestionId,"q0")).get()!;
 expect(schedule).toMatchObject({dueDate:"2026-11-01",lastOutcome:"correct",lastMissDate:"2026-10-31"});
});
it("does not offer unavailable courses or record abandoned batch answers", () => {
 setupStudy("a","UTC",now);const first=issueReview("a",now),replacement=issueReview("a",now,true);
 expect(replacement.id).not.toBe(first.id);expect(db.select().from(studyReviewEvents).all()).toEqual([]);
 db.update(courses).set({preparationStatus:"generating"}).where(eq(courses.id,"course")).run();
 expect(todayStudy("a",now)).toMatchObject({dueCount:0,unavailableCount:7,nextLesson:null});
 expect(()=>loadReview("a",replacement.id)).toThrow(/changed/);
});
