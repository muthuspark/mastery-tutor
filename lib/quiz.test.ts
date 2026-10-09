import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { generateValidQuiz, gradeMcq, normalizeAnswer } from "./quiz";

describe("quiz grading", () => {
  it("normalizes whitespace and grades an MCQ by answer text", () => {
    expect(normalizeAnswer("  A   useful answer ")).toBe("a useful answer");
    expect(gradeMcq("A useful answer", "A useful answer", ["A useful answer", "Another answer"]).score).toBe(1);
    expect(gradeMcq("1", "Another answer", ["A useful answer", "Another answer"]).score).toBe(1);
  });

  it("returns a missed concept for an incorrect answer", () => {
    expect(gradeMcq("Wrong", "Right", null)).toMatchObject({ score: 0, missedConcept: "Right" });
  });
});

describe("quiz generation", () => {
  const questions = Array.from({ length: 10 }, (_, index) => ({ type: "mcq" as const, prompt: `Question ${index}`, options: [`Correct ${index}`, "One", "Two", "Three"], modelAnswer: `Correct ${index}`, rubric: "Rule", conceptTag: "concept" }));

  it("retries once and balances a successful response", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("invalid")).mockResolvedValueOnce({ questions });
    const quiz = await generateValidQuiz("codex", "prompt", run);
    expect(run).toHaveBeenCalledTimes(2);
    expect([0, 1, 2, 3].map((position) => quiz.questions.filter((question) => question.options.indexOf(question.modelAnswer) === position).length).sort()).toEqual([2, 2, 3, 3]);
  });

  it("does not retry more than once", async () => {
    const run = vi.fn().mockRejectedValue(new Error("invalid"));
    await expect(generateValidQuiz("codex", "prompt", run)).rejects.toThrow("invalid");
    expect(run).toHaveBeenCalledTimes(2);
  });
});
