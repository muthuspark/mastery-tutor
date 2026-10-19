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

  it("returns the expected answer as feedback for an incorrect answer", () => {
    expect(gradeMcq("Wrong", "Right", null)).toMatchObject({ score: 0, feedback: "The expected answer is: Right." });
  });

  it.each(["2", "3", "0", "1"])("grades numeric option %s as text before considering indices", (answer) => {
    const options = ["2", "3", "0", "1"];
    expect(gradeMcq(`  ${answer}  `, answer, options)).toMatchObject({ score: 1, feedback: "Correct." });
    const otherAnswer = options[(options.indexOf(answer) + 1) % options.length];
    expect(gradeMcq(answer, otherAnswer, options).score).toBe(0);
  });

  it.each(["2x + 1", "1/2", "0.5", "3 squared"])("grades digit-leading expression %s as option text", (answer) => {
    const options = [answer, "First distractor", "Second distractor", "Third distractor"];
    expect(gradeMcq(answer.toUpperCase(), answer, options).score).toBe(1);
    for (const distractor of options.slice(1)) expect(gradeMcq(answer, distractor, options).score).toBe(0);
  });

  it("normalizes option text before deciding whether to use an index", () => {
    expect(gradeMcq("  2X   + 1  ", "2x + 1", ["2x + 1", "Wrong", "Other"]).score).toBe(1);
    expect(gradeMcq("  ordinary   TEXT  ", "Ordinary text", ["Wrong", "Ordinary text"]).score).toBe(1);
  });

  it.each(["0", "1", "2", "3"])("preserves legacy zero-based index %s when no option text matches", (index) => {
    const options = ["Alpha", "Beta", "Gamma", "Delta"];
    expect(gradeMcq(` ${index} `, options[Number(index)], options).score).toBe(1);
  });

  it.each(["2x", "1/2", "0.5", "3 trailing", "-1", "4"])("does not reinterpret invalid index %s", (response) => {
    const options = ["Alpha", "Beta", "Gamma", "Delta"];
    for (const answer of options) expect(gradeMcq(response, answer, options).score).toBe(0);
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
