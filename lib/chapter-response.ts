import "server-only";

import { asc, eq } from "drizzle-orm";
import { db } from "./db";
import { chapters, chapterVersions } from "./db/schema";
import { renderMarkdown } from "./markdown";

export function savedChapterVersions(id: string) {
  return db.select().from(chapterVersions).where(eq(chapterVersions.chapterId, id)).orderBy(asc(chapterVersions.generationVersion)).all();
}

export async function chapterResponse(chapter: typeof chapters.$inferSelect) {
  const previous = savedChapterVersions(chapter.id);
  const versions = [...previous];
  if (previous.length && chapter.contentGenerationStatus === "ready" && chapter.content) {
    versions.push({ chapterId: chapter.id, generationVersion: chapter.contentGenerationVersion, content: chapter.content, pretest: chapter.pretest, summary: chapter.summary, depthHint: chapter.depthHint, generatedAt: chapter.generatedAt });
  }
  return {
    chapter,
    html: await renderMarkdown(chapter.content ?? ""),
    versions: await Promise.all(versions.map(async version => ({
      generationVersion: version.generationVersion,
      depthHint: version.depthHint,
      html: await renderMarkdown(version.content),
    }))),
  };
}
