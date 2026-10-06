import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { modelFor, runCodexObject } from "@/lib/codex";
import { SYLLABUS_PROMPT, topicPrompt } from "@/lib/prompts";
import { syllabusSchema } from "@/lib/schemas";

const createCourseSchema = z.object({
  topic: z.string().trim().min(3).max(500),
});

function errorResponse(error: unknown) {
  if (!(error instanceof CodexError)) {
    return NextResponse.json(
      { error: { code: "database_error", message: "Could not save the course.", retryable: true } },
      { status: 500 },
    );
  }
  const classified = classifyCodexFailure(error);
  const status = classified.code === "not_found" ? 503 : classified.code === "timeout" ? 504 : 502;
  return NextResponse.json(
    { error: { code: classified.code, message: classified.message, retryable: classified.retryable } },
    { status },
  );
}

export async function GET() {
  const result = await db.select().from(courses).orderBy(asc(courses.createdAt));
  return NextResponse.json({ courses: result });
}

export async function POST(request: Request) {
  const parsed = createCourseSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "invalid_input", message: "Enter what you want to learn.", retryable: false } },
      { status: 400 },
    );
  }

  try {
    const syllabus = await runCodexObject(
      `${SYLLABUS_PROMPT}\n${topicPrompt(parsed.data.topic)}`,
      syllabusSchema,
      { model: modelFor("syllabus") },
    );
    const courseId = randomUUID();
    const now = new Date();

    db.transaction((tx) => {
      tx.insert(courses)
        .values({ id: courseId, topic: parsed.data.topic, level: "foundational", createdAt: now })
        .run();
      tx.insert(chapters)
        .values(
          syllabus.chapters.map((chapter, idx) => ({
            id: randomUUID(),
            courseId,
            idx,
            title: chapter.title,
            objectives: chapter.objectives,
            prerequisites: chapter.prerequisites,
            status: idx === 0 ? "open" as const : "locked" as const,
            createdAt: now,
          })),
        )
        .run();
    });

    return NextResponse.json({ courseId }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
