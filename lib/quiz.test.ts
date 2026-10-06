import { describe, expect, it } from "vitest";
import { vi } from "vitest";
vi.mock("server-only", () => ({}));
import { gradeMcq, normalizeAnswer } from "./quiz";

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
