import { asc, count, eq, getTableColumns, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { agentForRequest, agentSchema, AGENT_COOKIE, noAgentError, runAgentObject } from "@/lib/agent";
import { enqueueGenerationJob } from "@/lib/generation";
import { SYLLABUS_PROMPT, topicPrompt } from "@/lib/prompts";
import { syllabusSchema } from "@/lib/schemas";
import { learnerProfilePrompt } from "@/lib/profile";

const createCourseSchema = z.object({
  topic: z.string().trim().min(3).max(500),
  agent: agentSchema.optional(),
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
  const result = db.select({
    ...getTableColumns(courses),
    passed: count(sql`case when ${chapters.status} = 'passed' then 1 end`),
    total: count(chapters.id),
  }).from(courses)
    .leftJoin(chapters, eq(chapters.courseId, courses.id))
    .groupBy(courses.id)
    .orderBy(asc(courses.createdAt))
    .all();
  return NextResponse.json({ courses: result.map(({ passed, total, ...course }) => ({ ...course, progress: { passed, total } })) });
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
    const agent = await agentForRequest(request, parsed.data.agent);
    if (!agent) throw noAgentError();
    const syllabus = await runAgentObject(
      agent,
      "syllabus",
      `${SYLLABUS_PROMPT}\n${learnerProfilePrompt()}\n${topicPrompt(parsed.data.topic)}`,
      syllabusSchema,
    );
    const courseId = randomUUID();
    const now = new Date();
    const chapterRows = syllabus.chapters.map((chapter, idx) => ({
      id: randomUUID(),
      courseId,
      idx,
      title: chapter.title,
      objectives: chapter.objectives,
      prerequisites: chapter.prerequisites,
      status: idx === 0 ? "open" as const : "locked" as const,
      createdAt: now,
    }));

    db.transaction((tx) => {
      tx.insert(courses)
        .values({ id: courseId, topic: syllabus.topic, level: "foundational", createdAt: now })
        .run();
      tx.insert(chapters).values(chapterRows).run();
    });
    if (chapterRows[0]) enqueueGenerationJob("chapter", chapterRows[0].id, 1, now);

    const response = NextResponse.json({ courseId }, { status: 201 });
    response.cookies.set(AGENT_COOKIE, agent, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
