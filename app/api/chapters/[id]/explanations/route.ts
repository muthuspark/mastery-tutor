import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ChapterExplanationError,
  readChapterExplanations,
  requestChapterExplanation,
} from "@/lib/chapter-explanations";
import { renderMarkdown } from "@/lib/markdown";

const requestSchema = z.object({
  direction: z.enum(["simpler", "deeper"]),
  requestId: z.string().uuid(),
  expectedContentVersion: z.number().int().positive(),
  baselineExplanationId: z.string().min(1),
}).strict();

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const timeline = readChapterExplanations((await context.params).id);
    const sections = await Promise.all(timeline.sections.map(async (section) => ({
      ...section,
      html: await renderMarkdown(section.content ?? ""),
    })));
    return NextResponse.json({ ...timeline, sections });
  } catch (error) {
    if (error instanceof ChapterExplanationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "database_error", message: "Could not read explanations.", retryable: true } }, { status: 500 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Invalid explanation request.", retryable: false } }, { status: 400 });
  try {
    const result = requestChapterExplanation({ chapterId: (await context.params).id, ...parsed.data });
    return NextResponse.json({
      id: result.explanation.id,
      level: result.explanation.level,
      status: result.explanation.status,
      jobVersion: result.explanation.jobVersion,
    }, { status: result.replay && !["pending", "generating"].includes(result.explanation.status) ? 200 : 202 });
  } catch (error) {
    if (error instanceof ChapterExplanationError) {
      return NextResponse.json({ error: { code: error.code, message: error.message, retryable: error.retryable } }, { status: error.status });
    }
    // The partial unique active-request index is the final cross-tab race guard.
    return NextResponse.json({ error: { code: "generation_active", message: "An explanation is already being prepared. Reload the chapter.", retryable: true } }, { status: 409 });
  }
}
