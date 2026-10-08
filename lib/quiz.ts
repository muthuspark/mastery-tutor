import { and, asc, desc, eq, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { answers, attempts, chapters, questions, reviewItems } from "@/lib/db/schema";
import { runAgentObject, type Agent } from "@/lib/agent";
import { QUIZ_PROMPT, GRADING_PROMPT } from "@/lib/prompts";
import { gradeSchema, quizSchema } from "@/lib/schemas";

export function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function gradeMcq(response: string, modelAnswer: string, options: string[] | null) {
  const normalized = normalizeAnswer(response);
  const optionIndex = Number.parseInt(normalized, 10);
  const selected = Number.isInteger(optionIndex) && options?.[optionIndex] ? options[optionIndex] : response;
  const passed = normalizeAnswer(selected) === normalizeAnswer(modelAnswer);
  return { score: passed ? 1 : 0, feedback: passed ? "Correct." : `The expected answer is: ${modelAnswer}.`, missedConcept: passed ? null : modelAnswer };
}

export async function generateQuiz(chapterId: string, agent: Agent = "codex") {
  const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
  if (!chapter) throw new Error("Chapter not found");
  const generated = await runAgentObject(
    agent,
    "quiz",
    `${QUIZ_PROMPT}\nChapter: ${chapter.title}\nObjectives: ${chapter.objectives.join("; ")}`,
    quizSchema,
  );
  const now = new Date();
  const rows = generated.questions.map((question) => ({
    id: randomUUID(),
    chapterId,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    conceptTag: question.conceptTag,
    isReview: false,
    createdAt: now,
  }));
  db.insert(questions).values(rows).run();
  return rows;
}

export function dueReviewQuestions(courseId: string, chapterIdx: number, excludeQuestionIds = new Set<string>()) {
  return db
    .select({ question: questions })
    .from(reviewItems)
    .innerJoin(questions, eq(reviewItems.sourceQuestionId, questions.id))
    .where(and(eq(reviewItems.courseId, courseId), lte(reviewItems.dueAfterChapterIdx, chapterIdx)))
    .orderBy(desc(reviewItems.misses), asc(reviewItems.dueAfterChapterIdx))
    .limit(2)
    .all()
    .map(({ question }) => ({ ...question, isReview: true }))
    .filter((question) => question.type === "mcq" && (question.options?.length ?? 0) >= 2 && !excludeQuestionIds.has(question.id));
}

export function latestAttempt(chapterId: string) {
  return db.select().from(attempts).where(eq(attempts.chapterId, chapterId)).orderBy(desc(attempts.attemptNo)).get();
}

export function latestAttemptQuestionIds(attemptId: string) {
  return new Set(db.select({ questionId: answers.questionId }).from(answers).where(eq(answers.attemptId, attemptId)).all().map((row) => row.questionId));
}

export async function gradeAnswer(question: typeof questions.$inferSelect, response: string, agent: Agent = "codex") {
  if (question.type === "mcq") return gradeMcq(response, question.modelAnswer, question.options);
  return runAgentObject(
    agent,
    "grading",
    `${GRADING_PROMPT}\nQuestion: ${question.prompt}\nRubric: ${question.rubric}\nModel answer: ${question.modelAnswer}\nLearner response: ${response}`,
    gradeSchema,
  );
}
