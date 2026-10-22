import { relations } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type { CourseBrief, TeachingPlan } from "../quality-contracts";
import type { SocraticState } from "../socratic-contracts";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
};

export const learnerProfile = sqliteTable("learner_profile", {
  id: integer("id").primaryKey(),
  aboutMe: text("about_me").notNull().default(""),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  topic: text("topic").notNull(),
  level: text("level").notNull().default("foundational"),
  learningRequest: text("learning_request"),
  brief: text("brief", { mode: "json" }).$type<CourseBrief | null>(),
  qualityPolicyVersion: integer("quality_policy_version"),
  generationAgent: text("generation_agent", { enum: ["codex", "claude"] }),
  preparationStatus: text("preparation_status", { enum: ["pending", "generating", "ready", "failed"] }).notNull().default("ready"),
  preparationStage: text("preparation_stage", { enum: ["planning", "reviewing", "repairing"] }),
  preparationError: text("preparation_error"),
  preparationUpdatedAt: integer("preparation_updated_at", { mode: "timestamp_ms" }),
  preparationVersion: integer("preparation_version").notNull().default(1),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  ...timestamps,
});

export const chapters = sqliteTable(
  "chapters",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    idx: integer("idx").notNull(),
    title: text("title").notNull(),
    objectives: text("objectives", { mode: "json" }).$type<string[]>().notNull(),
    teachingPlan: text("teaching_plan", { mode: "json" }).$type<TeachingPlan | null>(),
    prerequisites: text("prerequisites", { mode: "json" }).$type<number[]>().notNull(),
    content: text("content"),
    pretest: text("pretest"),
    summary: text("summary"),
    status: text("status", { enum: ["locked", "open", "passed"] })
      .notNull()
      .default("locked"),
    depthHint: text("depth_hint", { enum: ["easy", "hard"] }),
    contentGenerationStatus: text("content_generation_status", { enum: ["pending", "generating", "ready", "failed"] })
      .notNull()
      .default("pending"),
    contentGenerationVersion: integer("content_generation_version").notNull().default(1),
    contentGenerationError: text("content_generation_error"),
    contentGenerationUpdatedAt: integer("content_generation_updated_at", { mode: "timestamp_ms" }),
    quizGenerationStatus: text("quiz_generation_status", { enum: ["pending", "generating", "ready", "failed"] })
      .notNull()
      .default("pending"),
    quizGenerationVersion: integer("quiz_generation_version").notNull().default(0),
    quizGenerationError: text("quiz_generation_error"),
    quizGenerationUpdatedAt: integer("quiz_generation_updated_at", { mode: "timestamp_ms" }),
    generatedAt: integer("generated_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => ({
    courseIndexUnique: uniqueIndex("chapters_course_idx_unique").on(table.courseId, table.idx),
    courseStatusIndex: index("chapters_course_status_idx").on(table.courseId, table.status),
  }),
);

export const socraticSessions = sqliteTable("socratic_sessions", {
  chapterId: text("chapter_id").primaryKey().references(() => chapters.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  generationVersion: integer("generation_version").notNull(),
  revision: integer("revision").notNull().default(0),
  state: text("state", { mode: "json" }).$type<SocraticState>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    artifactType: text("artifact_type", { enum: ["course", "chapter", "quiz"] }).notNull(),
    targetId: text("target_id").notNull(),
    generationVersion: integer("generation_version").notNull(),
    status: text("status", { enum: ["pending", "running", "completed", "failed"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextRunAt: integer("next_run_at", { mode: "timestamp_ms" }).notNull(),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: integer("lease_expires_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => ({
    targetVersionUnique: uniqueIndex("generation_jobs_target_version_unique").on(
      table.artifactType,
      table.targetId,
      table.generationVersion,
    ),
    readyIndex: index("generation_jobs_status_next_run_idx").on(table.status, table.nextRunAt),
    leaseIndex: index("generation_jobs_lease_expiry_idx").on(table.leaseExpiresAt),
  }),
);

export const questions = sqliteTable(
  "questions",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    type: text("type", { enum: ["mcq", "short", "explain"] }).notNull(),
    prompt: text("prompt").notNull(),
    options: text("options", { mode: "json" }).$type<string[] | null>(),
    rubric: text("rubric").notNull(),
    modelAnswer: text("model_answer").notNull(),
    conceptTag: text("concept_tag").notNull(),
    generationVersion: integer("generation_version").notNull().default(1),
    isReview: integer("is_review", { mode: "boolean" }).notNull().default(false),
    ...timestamps,
  },
  (table) => ({
    chapterIndex: index("questions_chapter_idx").on(table.chapterId),
  }),
);

export const attempts = sqliteTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    attemptNo: integer("attempt_no").notNull(),
    score: real("score").notNull(),
    passed: integer("passed", { mode: "boolean" }).notNull(),
    ...timestamps,
  },
  (table) => ({
    chapterAttemptUnique: uniqueIndex("attempts_chapter_attempt_no_unique").on(
      table.chapterId,
      table.attemptNo,
    ),
    chapterCreatedIndex: index("attempts_chapter_created_idx").on(table.chapterId, table.createdAt),
  }),
);

export const answers = sqliteTable(
  "answers",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" }),
    questionId: text("question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    response: text("response").notNull(),
    score: real("score").notNull(),
    feedback: text("feedback").notNull(),
    ...timestamps,
  },
  (table) => ({
    attemptQuestionUnique: uniqueIndex("answers_attempt_question_unique").on(
      table.attemptId,
      table.questionId,
    ),
    attemptIndex: index("answers_attempt_idx").on(table.attemptId),
  }),
);

export const reviewItems = sqliteTable(
  "review_items",
  {
    id: text("id").primaryKey(),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    conceptTag: text("concept_tag").notNull(),
    sourceQuestionId: text("source_question_id")
      .notNull()
      .references(() => questions.id, { onDelete: "cascade" }),
    misses: integer("misses").notNull().default(1),
    dueAfterChapterIdx: integer("due_after_chapter_idx").notNull(),
    ...timestamps,
  },
  (table) => ({
    courseConceptUnique: uniqueIndex("review_items_course_concept_unique").on(
      table.courseId,
      table.conceptTag,
    ),
    dueIndex: index("review_items_course_due_idx").on(table.courseId, table.dueAfterChapterIdx),
  }),
);

export const courseRelations = relations(courses, ({ many }) => ({
  chapters: many(chapters),
  reviewItems: many(reviewItems),
}));

export const chapterRelations = relations(chapters, ({ one, many }) => ({
  course: one(courses, { fields: [chapters.courseId], references: [courses.id] }),
  questions: many(questions),
  attempts: many(attempts),
}));

export const questionRelations = relations(questions, ({ one, many }) => ({
  chapter: one(chapters, { fields: [questions.chapterId], references: [chapters.id] }),
  answers: many(answers),
  reviewItems: many(reviewItems),
}));

export const attemptRelations = relations(attempts, ({ one, many }) => ({
  chapter: one(chapters, { fields: [attempts.chapterId], references: [chapters.id] }),
  answers: many(answers),
}));

export const answerRelations = relations(answers, ({ one }) => ({
  attempt: one(attempts, { fields: [answers.attemptId], references: [attempts.id] }),
  question: one(questions, { fields: [answers.questionId], references: [questions.id] }),
}));

export const reviewItemRelations = relations(reviewItems, ({ one }) => ({
  course: one(courses, { fields: [reviewItems.courseId], references: [courses.id] }),
  sourceQuestion: one(questions, {
    fields: [reviewItems.sourceQuestionId],
    references: [questions.id],
  }),
}));
