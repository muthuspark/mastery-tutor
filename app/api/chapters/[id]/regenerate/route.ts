import { NextResponse } from "next/server";
import { codexErrorResponse, regenerateChapter } from "@/app/api/chapters/[id]/route";
import { chapterResponse } from "@/lib/chapter-response";
import { agentForRequest } from "@/lib/agent";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  try {
    const chapter = await regenerateChapter(id, await agentForRequest(request));
    if (chapter instanceof NextResponse) return chapter;
    return NextResponse.json(await chapterResponse(chapter));
  } catch (error) {
    return codexErrorResponse(error);
  }
}
