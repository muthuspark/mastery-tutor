import { describe, expect, it } from "vitest";
import { chapterSchema, gradeSchema, quizSchema, syllabusSchema } from "./schemas";

describe("LLM contracts", () => {
  it("accepts a valid chapter and rejects content over 600 words", () => {
    expect(
      chapterSchema.safeParse({ pretest: "Predict", content: "A short chapter", summary: "Summary" })
        .success,
    ).toBe(true);
    expect(
      chapterSchema.safeParse({
        pretest: "Predict",
        content: Array.from({ length: 601 }, () => "word").join(" "),
        summary: "Summary",
      }).success,
    ).toBe(false);
  });

  it("enforces syllabus size and grade bounds", () => {
    expect(syllabusSchema.safeParse({ topic: "Differential Equations", chapters: [] }).success).toBe(false);
    expect(gradeSchema.safeParse({ score: 1.1, feedback: "No", missedConcept: null }).success).toBe(false);
  });

  it("requires a nonempty concise topic title from syllabus generation", () => {
    const chapters = Array.from({ length: 6 }, (_, idx) => ({ title: `Chapter ${idx}`, objectives: ["Learn"], prerequisites: [] }));
    expect(syllabusSchema.parse({ topic: " Differential Equations ", chapters }).topic).toBe("Differential Equations");
    for (const topic of [undefined, "", "  ", "a".repeat(101)]) {
      expect(syllabusSchema.safeParse({ topic, chapters }).success).toBe(false);
    }
  });

  it("requires ten objective multiple-choice questions", () => {
    const questions = Array.from({ length: 10 }, (_, index) => ({
      type: "mcq" as const,
      prompt: `Choose ${index}.`,
      options: ["One", "Two", "Three", "Four"],
      modelAnswer: "One",
      rubric: "Chooses one.",
      conceptTag: `choice-${index}`,
    }));
    expect(
      quizSchema.safeParse({ questions }).success,
    ).toBe(true);
    expect(quizSchema.safeParse({ questions: questions.slice(0, 9) }).success).toBe(false);
    expect(quizSchema.safeParse({ questions: questions.map((question) => ({ ...question, type: "short" })) }).success).toBe(false);
    expect(quizSchema.safeParse({ questions: questions.map((question) => ({ ...question, prompt: "Same question" })) }).success).toBe(false);
    expect(quizSchema.safeParse({ questions: questions.map((question) => ({ ...question, options: ["One", " one ", "Two", "Three"] })) }).success).toBe(false);
    expect(quizSchema.safeParse({ questions: questions.map((question) => ({ ...question, modelAnswer: "Missing" })) }).success).toBe(false);
  });
});
