import { describe, expect, it } from "vitest";
import {
  AssessmentQualityError,
  assertValidMcq,
  balanceQuizOptions,
  createBalancedPositionPlan,
  reorderOptions,
} from "./assessment-quality";

const question = {
  options: ["Correct answer", "First distractor", "Second distractor", "Third distractor"],
  modelAnswer: " Correct   answer ",
};

describe("assessment quality", () => {
  it("requires four distinct options with exactly one matching answer", () => {
    expect(() => assertValidMcq(question)).not.toThrow();
    expect(() => assertValidMcq({ ...question, options: question.options.slice(0, 3) })).toThrow(AssessmentQualityError);
    expect(() => assertValidMcq({ ...question, options: ["Correct answer", " correct answer ", "Two", "Three"] })).toThrow(AssessmentQualityError);
    expect(() => assertValidMcq({ ...question, modelAnswer: "Missing" })).toThrow(AssessmentQualityError);
  });

  it("creates a deterministic balanced position plan", () => {
    const random = () => 0;
    const plan = createBalancedPositionPlan(10, random);

    expect(plan).toHaveLength(10);
    expect([0, 1, 2, 3].map((position) => plan.filter((item) => item === position).length)).toEqual([3, 3, 2, 2]);
    expect(createBalancedPositionPlan(10, random)).toEqual(plan);
  });

  it("moves the correct option while preserving all options", () => {
    const reordered = reorderOptions(question, 2, () => 0);

    expect(reordered.options[2]).toBe("Correct answer");
    expect(reordered.options).toHaveLength(4);
    expect(new Set(reordered.options)).toEqual(new Set(question.options));
  });

  it("balances correct positions across a ten-question quiz", () => {
    const balanced = balanceQuizOptions(Array.from({ length: 10 }, (_, index) => ({
      ...question,
      options: [`Correct ${index}`, `Distractor A ${index}`, `Distractor B ${index}`, `Distractor C ${index}`],
      modelAnswer: `Correct ${index}`,
    })), () => 0);
    const positions = balanced.map((item) => item.options.indexOf(item.modelAnswer));

    expect([0, 1, 2, 3].map((position) => positions.filter((item) => item === position).length)).toEqual([3, 3, 2, 2]);
  });
});
