import { NextResponse } from "next/server";
import { z } from "zod";
import { ChapterExplanationError, retryChapterExplanation } from "@/lib/chapter-explanations";

const retrySchema = z.object({ requestId: z.string().uuid(), expectedJobVersion: z.number().int().positive() }).strict();

export async function POST(request: Request, context: { params: Promise<{ id: string; explanationId: string }> }) {
  const parsed = retrySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Invalid explanation retry request.", retryable: false } }, { status: 400 });
  try {
    const { id, explanationId } = await context.params;
    const result = retryChapterExplanation(id, explanationId, parsed.data.requestId, parsed.data.expectedJobVersion);
    return NextResponse.json({ id: result.explanation.id, level: result.explanation.level, status: result.explanation.status, jobVersion: result.explanation.jobVersion }, { status: result.replay ? 200 : 202 });
  } catch (error) {
    if (error instanceof ChapterExplanationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "database_error", message: "Could not retry this explanation.", retryable: true } }, { status: 500 });
  }
}
