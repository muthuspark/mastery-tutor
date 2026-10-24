export const EXPLANATION_LEVELS = [
  { level: 1, label: "Intuitive" },
  { level: 2, label: "Guided" },
  { level: 3, label: "Applied" },
  { level: 4, label: "Technical" },
  { level: 5, label: "Advanced" },
  { level: 6, label: "Research" },
] as const;

export type ExplanationLevel = (typeof EXPLANATION_LEVELS)[number]["level"];
export type ExplanationDirection = "simpler" | "deeper";

export const DEFAULT_EXPLANATION_LEVEL: ExplanationLevel = 2;
export const MIN_EXPLANATION_LEVEL: ExplanationLevel = 1;
export const MAX_EXPLANATION_LEVEL: ExplanationLevel = 6;

export function isExplanationLevel(value: number): value is ExplanationLevel {
  return Number.isInteger(value) && value >= MIN_EXPLANATION_LEVEL && value <= MAX_EXPLANATION_LEVEL;
}

export function explanationLevelLabel(level: ExplanationLevel): string {
  return EXPLANATION_LEVELS[level - 1].label;
}

export function adjacentExplanationLevel(level: ExplanationLevel, direction: ExplanationDirection): ExplanationLevel | null {
  const target = level + (direction === "simpler" ? -1 : 1);
  return isExplanationLevel(target) ? target : null;
}

/** Legacy chapters have no measured depth. Use Guided only as the starting point for navigation. */
export function explanationNavigationBaseline(level: ExplanationLevel | null): ExplanationLevel {
  return level ?? DEFAULT_EXPLANATION_LEVEL;
}

const COMMON_CONTRACT = `Keep every stated learning objective, preserve correctness, and stay within the learner's stated prerequisites. Do not introduce concepts taught later in the course without explaining them from available prerequisites. Make the explanation self-contained, use clear transitions, and keep it to 600 words or fewer.`;

const LEVEL_CONTRACTS: Record<ExplanationLevel, string> = {
  1: `Use ELI5 language: explain as if to a curious five-year-old, using short familiar words and concrete examples. This is a language and intuition target, not permission to omit essential ideas or state anything inaccurate. Use an analogy only when it helps, and clearly explain where its limits are.`,
  2: `Use a guided introduction. Build intuition from a familiar example, explain each needed term, and show the reasoning one step at a time.`,
  3: `Use an applied explanation. Connect the core idea to practical situations, worked examples, and decisions the learner can make with it.`,
  4: `Use a technical explanation. Define precise terms, show relevant mechanisms or equations, and explain how the parts fit together.`,
  5: `Use an advanced explanation. Explore subtle distinctions, assumptions, edge cases, and meaningful connections while making each inference clear.`,
  6: `Use a research-level explanation. Discuss formal structure, current disciplinary framing, limitations, and open questions only when supported by the supplied source material; do not invent citations or facts.`,
};

export function explanationPromptContract(level: ExplanationLevel): string {
  return `${LEVEL_CONTRACTS[level]} ${COMMON_CONTRACT}`;
}

export function originalExplanationPromptContract(): string {
  return explanationPromptContract(DEFAULT_EXPLANATION_LEVEL);
}
