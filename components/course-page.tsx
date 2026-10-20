"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RevisitDialog } from "@/components/revisit-dialog";
import { CoursePreparation, type PreparationState } from "./course-preparation";
import { BackToLearning } from "./back-link";

type Chapter = { id: string; idx: number; title: string; prerequisites: number[]; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string } & PreparationState; chapters: Chapter[]; progress: { passed: number; total: number } };

export function CoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [revisitChapter, setRevisitChapter] = useState<Chapter | null>(null);
  const [isRevisiting, setIsRevisiting] = useState(false);
  const [revisitError, setRevisitError] = useState("");
  const { data, isLoading, isError, refetch, isFetching, isFetched } = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => { if (!response.ok) throw new Error("Could not load course"); return response.json(); }), refetchInterval: (query) => ["pending", "generating"].includes(query.state.data?.course.preparationStatus ?? "") ? 2_000 : false });
  if (isLoading && !isFetched) return <main id="main-content" tabIndex={-1} className="page-shell"><p className="loading-state ui text-sm text-[var(--muted)]" role="status">Loading course…</p></main>;
  if (isError || !data) return (
    <main id="main-content" tabIndex={-1} className="page-shell">
      <BackToLearning />
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
    <main id="main-content" tabIndex={-1} className="page-shell">
      <BackToLearning />
      <header className="course-hero">
        <h1 className="course-title display max-w-3xl text-5xl leading-none md:text-6xl">{data.course.topic}</h1>
      </header>
      <div className="course-toolbar">
        <p className="text-lg text-[var(--muted)]">{passed} of {total} chapters mastered</p>
        <a className="button-secondary ui shrink-0" href={`/api/courses/${params.id}/export`}>Export notes</a>
      </div>
      {total === 0 ? (
        <section className="border-t border-[var(--line)] pt-6" aria-labelledby="empty-course-heading">
          <h2 id="empty-course-heading" className="display text-3xl leading-tight">No chapters available</h2>
          <p className="mt-3 text-lg text-[var(--muted)]">This course has no chapters yet.</p>
        </section>
      ) : (
        <ol className="chapter-list divide-y divide-[var(--line)]">
          {data.chapters.map((chapter) => {
            const isOpen = chapter.status === "open";
            const isPassed = chapter.status === "passed";
            if (isPassed) return (
              <li key={chapter.id}>
                <div className="chapter-row chapter-row--mastered">
                  <span className="ui text-xs font-bold" role="img" aria-label="Completed">✓</span>
                  <span className="chapter-title text-xl">{chapter.title}</span>
                  <span className="chapter-row-actions ui text-xs">
                    <Link className="chapter-read" href={`/course/${params.id}/ch/${chapter.idx}`} aria-label={`Read → ${chapter.title}`}>Read →</Link>
                    <button type="button" className="text-button chapter-retake" aria-label={`Retake mastery check → ${chapter.title}`} aria-haspopup="dialog" onClick={() => openRevisitDialog(chapter)}>Retake →</button>
                  </span>
                </div>
              </li>
            );
            const content = <>
              <span className="ui text-xs font-bold" aria-hidden="true">{String(chapter.idx + 1).padStart(2, "0")}</span>
              <div>
                <span className="chapter-title text-xl">{chapter.title}</span>
              </div>
              <span className="chapter-row-actions ui text-xs">
                <span className="font-bold">{isOpen ? "Continue →" : "Locked"}</span>
              </span>
            </>;
            return (
              <li key={chapter.id}>
                {chapter.status === "locked" ? <div className="chapter-row text-[var(--muted)]">{content}</div> : (
                  <Link className={`chapter-row chapter-link no-underline hover:bg-[var(--paper-deep)] ${isOpen ? "text-[var(--accent)]" : ""}`} href={`/course/${params.id}/ch/${chapter.idx}`} aria-current={isOpen ? "step" : undefined}>{content}</Link>
                )}
              </li>
            );
          })}
        </ol>
      )}
      {completed ? <p className="mt-8 text-xl text-[var(--success)]" role="status">You completed this course.</p> : null}
      <RevisitDialog open={Boolean(revisitChapter)} chapterTitle={revisitChapter?.title ?? "this chapter"} isSubmitting={isRevisiting} error={revisitError} onCancel={() => { if (!isRevisiting) { setRevisitChapter(null); setRevisitError(""); } }} onConfirm={() => void confirmRevisit()} />
    </main>
  );
}
