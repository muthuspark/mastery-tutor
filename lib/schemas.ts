import { z } from "zod";

const normalizeOption = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export const syllabusSchema = z.object({
  chapters: z
    .array(
      z.object({
        title: z.string().trim().min(1),
        objectives: z.array(z.string().trim().min(1)).min(1).max(3),
        prerequisites: z.array(z.number().int().nonnegative()),
      }),
    )
    .min(6)
    .max(15),
});

export const chapterSchema = z.object({
  pretest: z.string().trim().min(1),
  content: z.string().trim().min(1).refine((value) => value.split(/\s+/).length <= 600, {
    message: "Chapter content must be 600 words or fewer",
  }),
  summary: z.string().trim().min(1),
});

export const quizSchema = z.object({
  questions: z
    .array(
      z.object({
        type: z.literal("mcq"),
        prompt: z.string().trim().min(1),
        options: z.array(z.string().trim().min(1)).length(4),
        modelAnswer: z.string().trim().min(1),
        rubric: z.string().trim().min(1),
        conceptTag: z.string().trim().min(1),
      }),
    )
    .length(10)
    .refine((questions) => new Set(questions.map((question) => question.prompt.toLowerCase())).size === questions.length, {
      message: "Quiz questions must be different",
    })
    .refine((questions) => questions.every((question) => {
      const options = question.options.map(normalizeOption);
      return new Set(options).size === options.length
        && options.filter((option) => option === normalizeOption(question.modelAnswer)).length === 1;
    }), { message: "Each model answer must match exactly one distinct option" }),
});

export const gradeSchema = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string().trim().min(1),
  missedConcept: z.string().trim().nullable(),
});

export type Syllabus = z.infer<typeof syllabusSchema>;
export type Chapter = z.infer<typeof chapterSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type Grade = z.infer<typeof gradeSchema>;
