import { describe, expect, it } from "vitest";
import {
  adjacentExplanationLevel,
  explanationLevelLabel,
  explanationNavigationBaseline,
  explanationPromptContract,
  isExplanationLevel,
  originalExplanationPromptContract,
} from "./explanation-levels";

describe("explanation levels", () => {
  it("validates the six levels and computes adjacent targets within bounds", () => {
    expect(isExplanationLevel(1)).toBe(true);
    expect(isExplanationLevel(6)).toBe(true);
    expect(isExplanationLevel(0)).toBe(false);
    expect(isExplanationLevel(7)).toBe(false);
    expect(isExplanationLevel(2.5)).toBe(false);
    expect(adjacentExplanationLevel(2, "simpler")).toBe(1);
    expect(adjacentExplanationLevel(2, "deeper")).toBe(3);
    expect(adjacentExplanationLevel(1, "simpler")).toBeNull();
    expect(adjacentExplanationLevel(6, "deeper")).toBeNull();
    expect(explanationLevelLabel(1)).toBe("Intuitive");
    expect(explanationLevelLabel(6)).toBe("Research");
  });

  it("uses Guided as a legacy navigation baseline without labeling legacy content", () => {
    expect(explanationNavigationBaseline(null)).toBe(2);
    expect(explanationNavigationBaseline(4)).toBe(4);
  });

  it("gives Intuitive an ELI5 contract with accuracy safeguards and Guided originals", () => {
    const intuitive = explanationPromptContract(1);
    expect(intuitive).toContain("ELI5");
    expect(intuitive).toContain("not permission to omit essential ideas");
    expect(intuitive).toContain("preserve correctness");
    expect(originalExplanationPromptContract()).toBe(explanationPromptContract(2));
  });
});
