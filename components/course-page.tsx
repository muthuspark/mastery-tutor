"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RevisitDialog } from "@/components/revisit-dialog";

type Chapter = { id: string; idx: number; title: string; prerequisites: number[]; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string }; chapters: Chapter[]; progress: { passed: number; total: number } };

export function CoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [revisitChapter, setRevisitChapter] = useState<Chapter | null>(null);
  const [isRevisiting, setIsRevisiting] = useState(false);
  const [revisitError, setRevisitError] = useState("");
  const { data, isLoading, isError, refetch, isFetching, isFetched } = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => { if (!response.ok) throw new Error("Could not load course"); return response.json(); }) });
  if (isLoading && !isFetched) return <main className="page-shell"><p className="ui text-sm text-[var(--muted)]" role="status">Loading course…</p></main>;
  if (isError || !data) return (
    <main className="page-shell">
      <h1 className="display text-4xl leading-none">Course unavailable</h1>
      <p className="ui mt-5 text-sm text-[var(--muted)]" role={isFetching ? "status" : "alert"}>{isFetching ? "Loading course…" : "Could not load this course."}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        <button type="button" className="button-primary ui" disabled={isFetching} onClick={() => void refetch()}>{isFetching ? "Trying again…" : "Try again"}</button>
        <Link href="/" className="button-secondary ui">Back to learning</Link>
      </div>
    </main>
  );
  const total = data.chapters.length;
  const passed = data.chapters.filter((chapter) => chapter.status === "passed").length;
  const completed = total > 0 && passed === total;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
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
    <main className="page-shell">
      <header className="border-b border-[var(--line)] pb-7">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0 max-w-full flex-1 basis-72">
            <p className="ui text-xs uppercase tracking-[0.1em] text-[var(--muted)]">A course in</p>
            <h1 className="course-title display mt-2 max-w-3xl text-5xl leading-none md:text-6xl">{data.course.topic}</h1>
          </div>
          <div className="ui w-44 max-w-full text-sm text-[var(--muted)]">
            <div className="flex justify-between gap-4"><span>Progress</span><span>{percent}%</span></div>
            <div className="mt-2 h-1 bg-[var(--line)]" role="progressbar" aria-label="Course mastery" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${passed} of ${total} chapters mastered`}>
              <div className="h-1 bg-[var(--accent)]" style={{ width: `${percent}%` }} />
            </div>
          </div>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-4 py-5">
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-lg text-[var(--muted)]">{passed} of {total} chapters mastered</p>
        </div>
        <a className="button-secondary ui shrink-0" href={`/api/courses/${params.id}/export`}>Export notes</a>
      </div>
      {total === 0 ? (
        <section className="border-t border-[var(--line)] pt-6" aria-labelledby="empty-course-heading">
          <h2 id="empty-course-heading" className="display text-3xl leading-tight">No chapters available</h2>
          <p className="mt-3 text-lg text-[var(--muted)]">This course has no chapters yet.</p>
          <Link href="/" className="button-secondary ui mt-6">Back to learning</Link>
        </section>
      ) : (
        <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
          {data.chapters.map((chapter) => {
            const isOpen = chapter.status === "open";
            const isPassed = chapter.status === "passed";
            if (isPassed) return (
              <li key={chapter.id}>
                <div className="chapter-row chapter-row--mastered">
                  <span className="ui text-xs font-bold" aria-hidden="true">✓</span>
                  <span className="chapter-title text-xl">{chapter.title}</span>
                  <span className="chapter-row-actions ui text-xs">
                    <span className="text-[var(--success)]">Mastered</span>
                    <Link className="chapter-read" href={`/course/${params.id}/ch/${chapter.idx}`} aria-label={`Read lesson → ${chapter.title}`}>Read lesson →</Link>
                    <button type="button" className="text-button chapter-retake" aria-label={`Retake → ${chapter.title}`} aria-haspopup="dialog" onClick={() => openRevisitDialog(chapter)}>Retake →</button>
                  </span>
                </div>
              </li>
            );
            const content = <>
              <span className="ui text-xs font-bold" aria-hidden="true">{String(chapter.idx + 1).padStart(2, "0")}</span>
              <span className="chapter-title text-xl">{chapter.title}</span>
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
