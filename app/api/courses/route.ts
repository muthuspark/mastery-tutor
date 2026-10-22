import { asc, count, eq, getTableColumns, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { db } from "@/lib/db";
import { chapters, courses } from "@/lib/db/schema";
import { classifyCodexFailure, CodexError } from "@/lib/codex-errors";
import { agentForRequest, noAgentError } from "@/lib/agent";
import { enqueueGenerationJob } from "@/lib/generation";
import { QUALITY_POLICY_VERSION } from "@/lib/quality-contracts";

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
    const agent = await agentForRequest(request);
    if (!agent) throw noAgentError();
    const courseId = randomUUID();
    const now = new Date();
    db.transaction((tx) => {
      tx.insert(courses)
        .values({ id: courseId, topic: parsed.data.topic.slice(0, 100), learningRequest: parsed.data.topic, qualityPolicyVersion: QUALITY_POLICY_VERSION, generationAgent: agent, preparationStatus: "pending", preparationStage: "planning", preparationUpdatedAt: now, createdAt: now })
        .run();
      enqueueGenerationJob("course", courseId, 1, now);
    });
    const response = NextResponse.json({ courseId, status: "pending" }, { status: 202 });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
