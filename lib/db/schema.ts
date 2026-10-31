import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import type { CourseBrief, TeachingPlan } from "../quality-contracts";
import type { SocraticState } from "../socratic-contracts";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
};

export const user = sqliteTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  image: text("image"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const invitations = sqliteTable("invitations", {
  email: text("email").primaryKey(),
  invitedBy: text("invited_by").notNull().references(() => user.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const session = sqliteTable("session", {
  id: text("id").primaryKey(),
  token: text("token").notNull().unique(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  ipAddress: text("ip_address"), userAgent: text("user_agent"),
}, (t) => [index("session_user_idx").on(t.userId)]);
export const account = sqliteTable("account", {
  id: text("id").primaryKey(), accountId: text("account_id").notNull(), providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"), refreshToken: text("refresh_token"), idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp_ms" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp_ms" }),
  scope: text("scope"), password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("account_user_idx").on(t.userId)]);
export const verification = sqliteTable("verification", {
  id: text("id").primaryKey(), identifier: text("identifier").notNull(), value: text("value").notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp_ms" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);
// Fixed windows, cooldowns, and a database lease persist across process restarts.
export const authLimits = sqliteTable("auth_limits", {
  key: text("key").primaryKey(), count: integer("count").notNull(), resetAt: integer("reset_at").notNull(),
});
export const authEvents = sqliteTable("auth_events", {
  id: text("id").primaryKey(), event: text("event").notNull(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
}, (t) => [uniqueIndex("auth_event_user_unique").on(t.userId, t.event).where(sql`${t.event} IN ('first_course', 'first_lesson')`)]);

export const learnerProfile = sqliteTable("learner_profile", {
  id: integer("id").primaryKey(),
  userId: text("user_id").references(() => user.id).unique(),
  aboutMe: text("about_me").notNull().default(""),
  learningAgent: text("learning_agent", { enum: ["codex", "claude", "deepseek"] }),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const courses = sqliteTable("courses", {
  id: text("id").primaryKey(),
  userId: text("user_id").references(() => user.id),
  topic: text("topic").notNull(),
  level: text("level").notNull().default("foundational"),
  learningRequest: text("learning_request"),
  brief: text("brief", { mode: "json" }).$type<CourseBrief | null>(),
  qualityPolicyVersion: integer("quality_policy_version"),
  generationAgent: text("generation_agent", { enum: ["codex", "claude", "deepseek"] }),
  preparationStatus: text("preparation_status", { enum: ["pending", "generating", "ready", "failed"] }).notNull().default("ready"),
  preparationStage: text("preparation_stage", { enum: ["planning", "reviewing", "repairing"] }),
  preparationError: text("preparation_error"),
  preparationUpdatedAt: integer("preparation_updated_at", { mode: "timestamp_ms" }),
  preparationVersion: integer("preparation_version").notNull().default(1),
  startedAt: integer("started_at", { mode: "timestamp_ms" }),
  completedAt: integer("completed_at", { mode: "timestamp_ms" }),
  ...timestamps,
}, (t) => [index("courses_user_idx").on(t.userId)]);

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
    originalExplanationLevel: integer("original_explanation_level"),
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

export const chapterVersions = sqliteTable("chapter_versions", {
  chapterId: text("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  generationVersion: integer("generation_version").notNull(),
  content: text("content").notNull(),
  pretest: text("pretest"),
  summary: text("summary"),
  depthHint: text("depth_hint", { enum: ["easy", "hard"] }),
  generatedAt: integer("generated_at", { mode: "timestamp_ms" }),
}, (table) => ({
  chapterVersionUnique: uniqueIndex("chapter_versions_chapter_version_unique").on(table.chapterId, table.generationVersion),
}));

export const socraticSessions = sqliteTable("socratic_sessions", {
  chapterId: text("chapter_id").primaryKey().references(() => chapters.id, { onDelete: "cascade" }),
  id: text("id").notNull(),
  generationVersion: integer("generation_version").notNull(),
  revision: integer("revision").notNull().default(0),
  state: text("state", { mode: "json" }).$type<SocraticState>().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});

export const chapterExplanations = sqliteTable("chapter_explanations", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
  ordinal: integer("ordinal").notNull(),
  kind: text("kind", { enum: ["original", "alternative", "legacy"] }).notNull(),
  sourceContentVersion: integer("source_content_version").notNull(),
  sourcePreparationVersion: integer("source_preparation_version").notNull(),
  importKey: text("import_key"),
  parentExplanationId: text("parent_explanation_id"),
  requestId: text("request_id"),
  direction: text("direction", { enum: ["simpler", "deeper"] }),
  level: integer("level"),
  content: text("content"),
  status: text("status", { enum: ["pending", "generating", "ready", "failed"] }).notNull(),
  error: text("error"),
  jobVersion: integer("job_version").notNull().default(1),
  lastRetryRequestId: text("last_retry_request_id"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  generatedAt: integer("generated_at", { mode: "timestamp_ms" }),
}, (table) => ({
  ordinalUnique: uniqueIndex("chapter_explanations_chapter_ordinal_unique").on(table.chapterId, table.ordinal),
  requestUnique: uniqueIndex("chapter_explanations_chapter_request_unique").on(table.chapterId, table.requestId).where(sql`${table.requestId} IS NOT NULL`),
  importUnique: uniqueIndex("chapter_explanations_chapter_import_unique").on(table.chapterId, table.importKey).where(sql`${table.importKey} IS NOT NULL`),
  activeUnique: uniqueIndex("chapter_explanations_one_active_per_chapter_unique").on(table.chapterId).where(sql`${table.status} IN ('pending', 'generating')`),
}));

export const generationJobs = sqliteTable(
  "generation_jobs",
  {
    id: text("id").primaryKey(),
    artifactType: text("artifact_type", { enum: ["course", "chapter", "quiz", "explanation"] }).notNull(),
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

// Private immutable delivery and committed replay result; keys never enter public DTOs.
export const assessmentSessions = sqliteTable(
  "assessment_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["open", "consumed", "invalidated"],
    }).notNull(),
    snapshot: text("snapshot", { mode: "json" })
      .$type<import("../assessment-sessions").AssessmentSnapshot>()
      .notNull(),
    submission: text("submission"),
    result: text("result", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("assessment_open_unique")
      .on(t.userId, t.chapterId)
      .where(sql`${t.status} = 'open'`),
  ],
);

export const studyPreferences = sqliteTable("study_preferences", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  timeZone: text("time_zone").notNull(),
  initializedAt: integer("initialized_at", { mode: "timestamp_ms" }).notNull(),
  policyVersion: integer("policy_version").notNull().default(1),
});
export const conceptReviewSchedules = sqliteTable(
  "concept_review_schedules",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    courseId: text("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    chapterId: text("chapter_id")
      .notNull()
      .references(() => chapters.id, { onDelete: "cascade" }),
    normalizedTag: text("normalized_tag").notNull(),
    displayTag: text("display_tag").notNull(),
    sourceQuestionId: text("source_question_id").references(
      () => questions.id,
      { onDelete: "set null" },
    ),
    sourceContentVersion: integer("source_content_version").notNull(),
    dueDate: text("due_date").notNull(),
    intervalStage: integer("interval_stage").notNull().default(0),
    lastObservedAt: integer("last_observed_at", { mode: "timestamp_ms" }),
    lastObservedDate: text("last_observed_date"),
    lastOutcome: text("last_outcome", { enum: ["correct", "incorrect"] }),
    lastMissDate: text("last_miss_date"),
    suspended: integer("suspended", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(0),
  },
  (t) => [
    uniqueIndex("study_concept_unique").on(
      t.userId,
      t.chapterId,
      t.normalizedTag,
    ),
    index("study_due_idx").on(t.userId, t.dueDate),
  ],
);
export const studyReviewEvents = sqliteTable(
  "study_review_events",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scheduleId: text("schedule_id")
      .notNull()
      .references(() => conceptReviewSchedules.id, { onDelete: "cascade" }),
    sourceKind: text("source_kind", { enum: ["chapter", "review"] }).notNull(),
    sourceEventId: text("source_event_id").notNull(),
    outcome: text("outcome", { enum: ["correct", "incorrect"] }).notNull(),
    observedAt: integer("observed_at", { mode: "timestamp_ms" }).notNull(),
    localDate: text("local_date").notNull(),
    policyVersion: integer("policy_version").notNull().default(1),
  },
  (t) => [
    uniqueIndex("study_event_unique").on(
      t.scheduleId,
      t.sourceKind,
      t.sourceEventId,
    ),
  ],
);
export const studyReviewSessions = sqliteTable(
  "study_review_sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    status: text("status", {
      enum: ["open", "consumed", "invalidated"],
    }).notNull(),
    snapshot: text("snapshot", { mode: "json" })
      .$type<import("../study-store").ReviewSnapshot>()
      .notNull(),
    submission: text("submission"),
    result: text("result", { mode: "json" }).$type<
      import("../study-contracts").ReviewResult
    >(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("study_open_unique")
      .on(t.userId)
      .where(sql`${t.status} = 'open'`),
  ],
);
