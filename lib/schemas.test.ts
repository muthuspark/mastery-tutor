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
    expect(syllabusSchema.safeParse({ chapters: [] }).success).toBe(false);
    expect(gradeSchema.safeParse({ score: 1.1, feedback: "No", missedConcept: null }).success).toBe(false);
  });

  it("requires nullable quiz options for Codex structured output compatibility", () => {
    expect(
      quizSchema.safeParse({
        questions: [
          {
            type: "short",
            prompt: "Explain it.",
            options: null,
            modelAnswer: "An explanation.",
            rubric: "Mentions the key idea.",
            conceptTag: "key-idea",
          },
          {
            type: "mcq",
            prompt: "Choose one.",
            options: ["One", "Two"],
            modelAnswer: "One",
            rubric: "Chooses one.",
            conceptTag: "choice",
          },
          {
            type: "explain",
            prompt: "Why?",
            options: null,
            modelAnswer: "Because.",
            rubric: "Explains why.",
            conceptTag: "reason",
          },
        ],
      }).success,
    ).toBe(true);
  });
});
