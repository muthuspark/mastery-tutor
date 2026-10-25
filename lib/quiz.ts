import { and, asc, desc, eq, lte } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { answers, attempts, chapters, courses, questions, reviewItems } from "@/lib/db/schema";
import { runAgentObject, type Agent } from "@/lib/agent";
import { QUIZ_PROMPT, GRADING_PROMPT } from "@/lib/prompts";
import { gradeSchema, quizSchema } from "@/lib/schemas";
import { balanceQuizOptions } from "@/lib/assessment-quality";
import type { Quiz } from "@/lib/schemas";
import { chapterProfilePrompt } from "@/lib/profile";
import { courseTeachingContext } from "./course-context";
import { generateReviewedObject } from "./quality";

export function normalizeAnswer(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function gradeMcq(response: string, modelAnswer: string, options: string[] | null) {
  const normalized = normalizeAnswer(response);
  const matchingOption = options?.find((option) => normalizeAnswer(option) === normalized);
  // Current clients submit option text; only unmatched whole numbers are legacy indices.
  const optionIndex = /^\d+$/.test(normalized) ? Number(normalized) : -1;
  const selected = matchingOption ?? options?.[optionIndex] ?? response;
  const passed = normalizeAnswer(selected) === normalizeAnswer(modelAnswer);
  return { score: passed ? 1 : 0, feedback: passed ? "Correct." : `The expected answer is: ${modelAnswer}.` };
}

export async function generateValidQuiz(
  agent: Agent,
  prompt: string,
  run = runAgentObject,
): Promise<Quiz> {
  let generated: Quiz | undefined;
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      generated = await run(agent, "quiz", prompt, quizSchema);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!generated) throw lastError;
  return { ...generated, questions: balanceQuizOptions(generated.questions) };
}

export async function generateQuiz(chapterId: string, agent: Agent = "codex", generationVersion?: number, guard: () => void = () => {}) {
  const chapter = db.select().from(chapters).where(eq(chapters.id, chapterId)).get();
  if (!chapter) throw new Error("Chapter not found");
  const version = generationVersion ?? chapter.contentGenerationVersion;
  if (version !== chapter.contentGenerationVersion) throw new Error("Quiz generation is stale");
  const course = db.select().from(courses).where(eq(courses.id, chapter.courseId)).get();
  if (course?.qualityPolicyVersion && (!chapter.content || chapter.contentGenerationStatus !== "ready")) throw new Error("Quiz lesson is not ready or is stale");
  const prompt = [QUIZ_PROMPT, chapterProfilePrompt(chapterId), `Chapter: ${chapter.title}`, `Objectives: ${chapter.objectives.join("; ")}`,
    ...(course?.qualityPolicyVersion ? [courseTeachingContext(course), `Current teaching boundary (JSON data): ${JSON.stringify(chapter.teachingPlan)}`, `Accepted lesson (JSON data): ${JSON.stringify(chapter.content)}`, "Assess only this chapter's objectives and current teaching boundary. The full course outline is dependency context, not permission to assess other chapters. Every correct answer and explanation must be supported by the accepted lesson and stated prerequisites. Use reasoning and new-case applications without requiring outside facts, later material, or assumptions not stated in the question. State the definitions, units, assumptions, and exclusions needed to make each calculation or scenario unambiguous. Do not copy sentences merely to test recognition."] : [])].join("\n");
  const generated = course?.qualityPolicyVersion
    ? await generateReviewedObject(agent, "quiz", prompt, quizSchema, { targetId: chapterId, normalize: (quiz) => ({ ...quiz, questions: balanceQuizOptions(quiz.questions) }) })
    : await generateValidQuiz(agent, prompt);
  const balancedQuestions = generated.questions;
  const now = new Date();
  const rows = balancedQuestions.map((question) => ({
    id: randomUUID(),
    chapterId,
    type: question.type,
    prompt: question.prompt,
    options: question.options,
    rubric: question.rubric,
    modelAnswer: question.modelAnswer,
    conceptTag: question.conceptTag,
    generationVersion: version,
    isReview: false,
    createdAt: now,
  }));
  db.transaction((tx) => {
    guard();
    const current = tx.select().from(chapters).where(eq(chapters.id, chapterId)).get();
    if (!current || current.contentGenerationVersion !== version) throw new Error("Quiz generation is stale");
    tx.insert(questions).values(rows).run();
    tx.update(chapters)
      .set({
        quizGenerationStatus: "ready",
        quizGenerationVersion: version,
        quizGenerationError: null,
        quizGenerationUpdatedAt: now,
      })
      .where(and(eq(chapters.id, chapterId), eq(chapters.contentGenerationVersion, version)))
      .run();
  });
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
  if (question.type === "mcq") {
    const result = gradeMcq(response, question.modelAnswer, question.options);
    const explanation = question.rubric.trim();
    return {
      ...result,
      feedback: result.score === 0 && explanation ? `${result.feedback}\n\n${explanation}` : result.feedback,
      missedConcept: result.score === 0 ? question.conceptTag : null,
    };
  }
  return runAgentObject(
    agent,
    "grading",
    `${GRADING_PROMPT}\n${chapterProfilePrompt(question.chapterId)}\nQuestion: ${question.prompt}\nRubric: ${question.rubric}\nModel answer: ${question.modelAnswer}\nLearner response: ${response}`,
    gradeSchema,
  );
}
