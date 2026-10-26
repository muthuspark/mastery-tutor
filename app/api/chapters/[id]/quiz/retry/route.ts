import { authorize } from "@/lib/access";
import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chapters } from "@/lib/db/schema";
import { enqueueGenerationJob } from "@/lib/generation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorize("chapter", await context.params);
  if (access instanceof Response) return access;
  const { id } = await context.params;
  return db.transaction((tx) => {
    const chapter = tx.select().from(chapters).where(eq(chapters.id, id)).get();
    if (!chapter) return NextResponse.json({ error: { code: "not_found", message: "Chapter not found." } }, { status: 404 });
    if (chapter.status === "locked") return NextResponse.json({ error: { code: "locked", message: "This chapter is locked." } }, { status: 403 });
    if (chapter.contentGenerationStatus !== "ready") return NextResponse.json({ error: { code: "not_ready", message: "Prepare the chapter before retrying its quiz." } }, { status: 409 });
    if (chapter.quizGenerationStatus === "failed" || chapter.quizGenerationStatus === "pending") {
      tx.update(chapters).set({ quizGenerationStatus: "pending", quizGenerationError: null }).where(eq(chapters.id, id)).run();
      enqueueGenerationJob("quiz", id, chapter.contentGenerationVersion);
    }
    return NextResponse.json({ status: "generating" }, { status: 202 });
  });
}
