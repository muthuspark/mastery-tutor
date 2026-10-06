import { NextResponse } from "next/server";
import { codexErrorResponse, regenerateChapter } from "@/app/api/chapters/[id]/route";
import { renderMarkdown } from "@/lib/markdown";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const chapter = await regenerateChapter(id);
    if (chapter instanceof NextResponse) return chapter;
    return NextResponse.json({ chapter, html: await renderMarkdown(chapter.content ?? "") });
  } catch (error) {
    return codexErrorResponse(error);
  }
}
