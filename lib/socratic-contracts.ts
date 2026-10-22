import { z } from "zod";

export const socraticQuestionSchema = z.object({
  setup: z.string().trim().min(1).max(900).describe("One to three short sentences giving only the facts or observation needed to reason, without revealing the answer"),
  prompt: z.string().trim().min(1).max(1500),
  options: z.array(z.string().trim().min(1).max(500)).min(3).max(4),
  correctIndex: z.number().int().min(0).max(3),
  feedback: z.array(z.string().trim().min(1).max(1200)).min(3).max(4),
  hint: z.string().trim().min(1).max(1200),
}).superRefine((question, context) => {
  const normalized = question.options.map((option) => option.toLowerCase().replace(/\s+/g, " "));
  if (new Set(normalized).size !== normalized.length || question.correctIndex >= question.options.length || question.feedback.length !== question.options.length) {
    context.addIssue({ code: "custom", message: "Use distinct options, one valid correct index, and feedback for every option." });
  }
});

export type SocraticQuestion = z.infer<typeof socraticQuestionSchema> & { id: string };
export type SocraticTurn = {
  question: SocraticQuestion;
  choiceIndex: number | null;
  usedHint: boolean;
  correct: boolean;
  feedback: string;
};
export type SocraticState = {
  question: SocraticQuestion | null;
  turns: SocraticTurn[];
  summary: string | null;
};

export type SocraticSessionView = {
  id: string;
  question: (Pick<SocraticQuestion, "id" | "prompt" | "options" | "hint"> & { setup?: string }) | null;
  turns: { prompt: string; response: string; feedback: string; correct: boolean; usedHint: boolean }[];
  summary: string | null;
};

export const socraticRequestSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start"), version: z.number().int().positive() }),
  z.object({
    action: z.literal("answer"),
    version: z.number().int().positive(),
    sessionId: z.string().uuid(),
    questionId: z.string().uuid(),
    choiceIndex: z.number().int().min(0).max(3).nullable(),
    usedHint: z.boolean(),
  }),
]);
export type SocraticRequest = z.infer<typeof socraticRequestSchema>;

export function shouldFinishSocratic(turns: SocraticTurn[]) {
  return turns.length >= 5 || (turns.length >= 3 && turns.slice(-3).every((turn) => turn.correct && !turn.usedHint));
}

export function socraticSessionView(id: string, state: SocraticState): SocraticSessionView {
  return {
    id,
    question: state.question ? { id: state.question.id, setup: state.question.setup, prompt: state.question.prompt, options: state.question.options, hint: state.question.hint } : null,
    turns: state.turns.map((turn) => ({
      prompt: turn.question.prompt,
      response: turn.choiceIndex === null ? "I'm not sure" : turn.question.options[turn.choiceIndex],
      feedback: turn.feedback,
      correct: turn.correct,
      usedHint: turn.usedHint,
    })),
    summary: state.summary,
  };
}
