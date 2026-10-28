"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RevisitDialog } from "@/components/revisit-dialog";
import { CoursePreparation, type PreparationState } from "./course-preparation";

type Chapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string } & PreparationState; chapters: Chapter[]; progress: { passed: number; total: number } };

export function CoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [revisitChapter, setRevisitChapter] = useState<Chapter | null>(null);
  const [isRevisiting, setIsRevisiting] = useState(false);
  const [revisitError, setRevisitError] = useState("");
  const { data, isLoading, isError, refetch, isFetching, isFetched } = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => { if (!response.ok) throw new Error("Could not load course"); return response.json(); }), refetchInterval: (query) => ["pending", "generating"].includes(query.state.data?.course.preparationStatus ?? "") ? 2_000 : false });
  if (isLoading && !isFetched) return <main id="main-content" tabIndex={-1} className="reading-shell"><p className="loading-state ui text-sm text-[var(--muted)]" role="status">Loading course…</p></main>;
  if (isError || !data) return (
    <main id="main-content" tabIndex={-1} className="reading-shell">
      <h1 className="display text-4xl leading-none">Course unavailable</h1>
      <p className="ui mt-5 text-sm text-[var(--muted)]" role={isFetching ? "status" : "alert"}>{isFetching ? "Loading course…" : "Could not load this course."}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" className="button-primary ui" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Trying again…" : "Try again"}</button>
      </div>
    </main>
  );
  if (data.course.preparationStatus && data.course.preparationStatus !== "ready") return <CoursePreparation courseId={params.id} course={data.course} onRefresh={refetch} />;
  const total = data.chapters.length;
  const passed = data.chapters.filter((chapter) => chapter.status === "passed").length;
  const completed = total > 0 && passed === total;
  const currentChapterId = data.chapters.find((chapter) => chapter.status === "open")?.id;
  function openRevisitDialog(chapter: Chapter) {
    setRevisitError("");
    setRevisitChapter(chapter);
  }
  async function confirmRevisit() {
    if (!revisitChapter) return;
    setIsRevisiting(true);
    try {
      const response = await fetch(`/api/chapters/${revisitChapter.id}/revisit`, { method: "POST" });
      if (!response.ok) throw new Error("Could not reset this chapter");
      router.push(`/course/${params.id}/ch/${revisitChapter.idx}`);
    } catch {
      setRevisitError("Could not reset this chapter. Please try again.");
      setIsRevisiting(false);
    }
  }
  return (
    <main id="main-content" tabIndex={-1} className="reading-shell course-index">
      <div className="course-console-toolbar">
      <header className="course-hero">
        <h1 className="display">{data.course.topic}</h1>
      </header>
      <div className="course-toolbar">
        <div className="course-index-progress">
        <p className="text-lg text-[var(--muted)]">{passed} of {total} chapters mastered</p>
        {total > 0 ? <div className="course-index-segments" aria-hidden="true">{data.chapters.map((chapter) => <span key={chapter.id} className={chapter.status === "passed" ? "is-mastered" : ""} />)}</div> : null}
        </div>
        <a className="button-secondary ui shrink-0" href={`/api/courses/${params.id}/export`}>Export notes</a>
      </div>
      </div>
      {total === 0 ? (
        <section className="border-t border-[var(--line)] pt-6" aria-labelledby="empty-course-heading">
          <h2 id="empty-course-heading" className="display text-3xl leading-tight">No chapters available</h2>
          <p className="mt-3 text-lg text-[var(--muted)]">This course has no chapters yet.</p>
        </section>
      ) : (
        <section aria-labelledby="course-chapters-title" className="course-index-outline">
        <h2 id="course-chapters-title" className="sr-only">Chapters</h2>
        <ol className="chapter-list">
          {data.chapters.map((chapter) => {
            const isOpen = chapter.status === "open";
            const isPassed = chapter.status === "passed";
            if (isPassed) return (
              <li key={chapter.id}>
                <div className="chapter-row chapter-row--mastered">
                  <span className="chapter-index-number" aria-hidden="true">{String(chapter.idx + 1).padStart(2, "0")}</span>
                  <div className="chapter-row-copy"><span className="chapter-title">{chapter.title}</span></div>
                  <span className="chapter-console-status"><svg className="chapter-status-icon" role="img" aria-label="Completed" viewBox="0 0 16 16"><path d="M1 7h3v3h3V7h3V4h3V1h3v5h-3v3h-3v3H7v3H4v-3H1z" fill="currentColor" /></svg>Mastered</span>
                  <span className="chapter-row-actions ui text-xs">
                    <Link className="chapter-read" href={`/course/${params.id}/ch/${chapter.idx}`} aria-label={`Read → ${chapter.title}`}>Read →</Link>
                    <button type="button" className="text-button chapter-retake" aria-label={`Retake mastery check → ${chapter.title}`} aria-haspopup="dialog" onClick={() => openRevisitDialog(chapter)}>Retake →</button>
                  </span>
                </div>
              </li>
            );
            const content = <>
              <span className="chapter-index-number" aria-hidden="true">{String(chapter.idx + 1).padStart(2, "0")}</span>
              <div className="chapter-row-copy">
                <span className="chapter-title">{chapter.title}</span>
              </div>
              <span className="chapter-console-status">{isOpen ? "Ready" : <><svg className="chapter-status-icon" aria-hidden="true" viewBox="0 0 16 16"><path d="M5 1h6v2h2v4h2v9H1V7h2V3h2zm0 2v4h6V3zm2 7v3h2v-3z" fill="currentColor" fillRule="evenodd" /></svg>Locked</>}</span>
              <span className="chapter-row-actions ui text-xs">
                {isOpen ? <span className={chapter.id === currentChapterId ? "chapter-console-continue" : "chapter-console-open"}>Continue →</span> : <span aria-hidden="true">—</span>}
              </span>
            </>;
            return (
              <li key={chapter.id}>
                {chapter.status === "locked" ? <div className="chapter-row text-[var(--muted)]">{content}</div> : (
                  <Link className="chapter-row chapter-link" href={`/course/${params.id}/ch/${chapter.idx}`} aria-label={`${chapter.title} Continue →`} aria-current={chapter.id === currentChapterId ? "step" : undefined}>{content}</Link>
                )}
              </li>
            );
          })}
        </ol>
        </section>
      )}
      {completed ? <p className="mt-8 text-xl text-[var(--success)]" role="status">You completed this course.</p> : null}
      <RevisitDialog open={Boolean(revisitChapter)} chapterTitle={revisitChapter?.title ?? "this chapter"} isSubmitting={isRevisiting} error={revisitError} onCancel={() => { if (!isRevisiting) { setRevisitChapter(null); setRevisitError(""); } }} onConfirm={() => void confirmRevisit()} />
    </main>
  );
}
