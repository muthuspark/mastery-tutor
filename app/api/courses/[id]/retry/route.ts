import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { courses } from "@/lib/db/schema";
import { enqueueGenerationJob } from "@/lib/generation";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return db.transaction((tx) => {
    const course = tx.select().from(courses).where(eq(courses.id, id)).get();
    if (!course) return NextResponse.json({ error: { code: "not_found", message: "Course not found." } }, { status: 404 });
    if (!course.qualityPolicyVersion || course.preparationStatus === "ready") return NextResponse.json({ error: { code: "not_retryable", message: "This course does not need preparation." } }, { status: 409 });
    if (course.preparationStatus === "failed") {
      tx.update(courses).set({ preparationStatus: "pending", preparationStage: "planning", preparationError: null, preparationUpdatedAt: new Date() }).where(eq(courses.id, id)).run();
      enqueueGenerationJob("course", id, course.preparationVersion);
    }
    return NextResponse.json({ courseId: id, status: "pending" }, { status: 202 });
  });
}
