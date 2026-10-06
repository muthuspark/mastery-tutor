# Mastery Tutor: Technical Implementation

## 1. Overview
A local, single-user web app. You enter a topic, and it builds a first-principles syllabus of short chapters. Each chapter is unlocked only after you pass the QnA for the previous one, and a progress bar at the top shows where you are.

## 2. Design Principles (research-backed)
| Principle | Implementation |
|---|---|
| Mastery learning (Bloom, 1984) | A chapter unlocks at ≥ 80% QnA score. On failure, you get a remediation note and fresh questions. |
| Retrieval practice (Roediger & Karpicke, 2006) | Free-recall and explain-why questions, not just MCQ |
| Spacing / interleaving (Cepeda, 2006) | Each quiz includes 1–2 review questions from earlier missed concepts |
| Cognitive load (Sweller) | One core idea per chapter, ~5 min read: worked example, then concept |
| Pretesting (Richland, 2009) | One prediction question shown before the chapter content |
| Elaborative feedback (Hattie, 2007) | Every graded answer explains *why* it is right or wrong |

## 3. Tech Stack
| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, TypeScript) |
| UI | React + Tailwind; react-markdown, KaTeX, Shiki |
| Data fetching | TanStack Query |
| DB | SQLite via Drizzle ORM (`better-sqlite3`) |
| LLM | OpenAI `gpt-6-luna` via Vercel AI SDK (`ai`, `@ai-sdk/openai`) |
| Validation | Zod schemas for all LLM output |

`OPENAI_API_KEY` lives in `.env.local`. LLM calls happen only in server routes.

## 4. Architecture
```
Browser (React)  ──►  Next.js API routes  ──►  OpenAI (gpt-6-luna)
                               │
                               └──►  SQLite (tutor.db)
```

**Model routing** (`lib/llm.ts`) is configurable per task:
| Task | Model |
|---|---|
| Syllabus generation | Luna Pro reasoning mode (or Sol) |
| Chapter content, questions | `gpt-6-luna` |
| Free-text grading | Luna Pro reasoning mode (or Sol) |

## 5. Data Model (Drizzle)
```ts
courses      (id, topic, level, createdAt)
chapters     (id, courseId, idx, title, objectives JSON, prerequisites JSON,
              content TEXT NULL, status: 'locked'|'open'|'passed')
questions    (id, chapterId, type: 'mcq'|'short'|'explain', prompt,
              options JSON NULL, rubric, modelAnswer, conceptTag, isReview BOOL)
attempts     (id, chapterId, attemptNo, score, passed, createdAt)
answers      (id, attemptId, questionId, response, score, feedback)
reviewItems  (id, courseId, conceptTag, sourceQuestionId, misses, dueAfterChapterIdx)
```

## 6. LLM Contracts (Zod)
```ts
Syllabus = z.object({
  chapters: z.array(z.object({
    title: z.string(),
    objectives: z.array(z.string()).max(3),
    prerequisites: z.array(z.number()),   // chapter indices
  })).min(6).max(15),
});

Chapter = z.object({
  pretest: z.string(),                    // prediction question
  content: z.string(),                    // markdown, ≤ 600 words
  summary: z.string(),
});

Quiz = z.object({
  questions: z.array(z.object({
    type: z.enum(["mcq", "short", "explain"]),
    prompt: z.string(),
    options: z.array(z.string()).optional(),
    modelAnswer: z.string(),
    rubric: z.string(),
    conceptTag: z.string(),
  })).min(3).max(5),
});

Grade = z.object({
  score: z.number().min(0).max(1),
  feedback: z.string(),                   // explains why
  missedConcept: z.string().nullable(),
});
```

Example call:
```ts
const { object } = await generateObject({
  model: models.syllabus,
  schema: Syllabus,
  system: SYLLABUS_PROMPT,
  prompt: `Topic: ${topic}`,
});
```

## 7. Core Flows
**Create course**
1. `POST /api/courses {topic}` generates the syllabus and stores the chapters. Chapter 0 is `open`; the rest are `locked`.
2. The user can review and edit the syllabus before starting.

**Open chapter** (lazy generation)
1. `GET /api/chapters/:id`. If `content` is null, the server generates the content, passing in prior chapter summaries and the user's missed concepts, then caches it.
2. While the user reads, the server prefetches the quiz in the background.

**QnA and gate**
1. `GET /api/chapters/:id/quiz` returns the chapter questions plus up to 2 due `reviewItems`.
2. `POST /api/chapters/:id/attempts {answers}` grades the answers. MCQs are graded locally; free text goes to the LLM with the rubric.
3. If score ≥ 0.8, the chapter becomes `passed` and the next one becomes `open`.
4. Otherwise, the server returns feedback and a remediation explanation, and the retry uses newly generated questions.
5. Each missed concept is upserted into `reviewItems` (due 1–2 chapters later).

## 8. Prompting Rules
- **Syllabus:** Assume zero prior knowledge, order chapters by dependency, one concept per chapter, no forward references.
- **Chapter:** Start with a concrete example or problem, define terms on first use, and connect to prerequisites explicitly. Stay ≤ 600 words.
- **Questions:** Generate them from the *objectives*, not the chapter wording. At least one question should be "explain why" or "apply to a new case."
- **Grading:** Be strict on the rubric, accept equivalent phrasing, and always explain.

## 9. UI
- **Top bar:** course title and progress bar (`passed / total`), with a chapter stepper whose locked chapters show a lock icon.
- **Chapter view:** pretest prompt, then content, then a "Take QnA" button.
- **Quiz view:** one question at a time, submit-all, then a results screen showing per-question feedback and model answers.
- **Controls:** "Too easy / Too hard" sets a depth hint for the next chapter's generation.

## 10. Project Structure
```
app/
  page.tsx                      # course list + new topic
  course/[id]/page.tsx          # progress + chapter list
  course/[id]/ch/[idx]/page.tsx # chapter + quiz
  api/courses/route.ts
  api/chapters/[id]/route.ts
  api/chapters/[id]/quiz/route.ts
  api/chapters/[id]/attempts/route.ts
lib/
  db/schema.ts  db/index.ts
  llm.ts        prompts.ts   schemas.ts
  gating.ts     review.ts
components/
  ProgressBar.tsx  ChapterView.tsx  Quiz.tsx  Results.tsx
```

## 11. Milestones
1. **M1:** Scaffold the project, DB schema, and syllabus generation and display.
2. **M2:** Lazy chapter generation and markdown rendering.
3. **M3:** Quiz generation, grading, gating, and progress bar.
4. **M4:** Review queue, remediation, and difficulty feedback.
5. **M5:** Polish: prefetching, regenerate chapter, export course to markdown.

## 12. Notes
- Cache all generated content and never regenerate silently.
- Before relying on them, verify the exact model IDs and the reasoning-mode parameter in the OpenAI docs.
- Cost at Luna pricing is negligible for personal use.