"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
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
  if (isLoading && !isFetched) return <main id="main-content" tabIndex={-1} className="reading-shell"><p className="loading-state ui text-sm text-[var(--muted)]" role="status">Loading course…</p></main>;
  if (isError || !data) return (
    <main id="main-content" tabIndex={-1} className="reading-shell">
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
    <main id="main-content" tabIndex={-1} className="reading-shell course-index">
      <BackToLearning />
      <header className="course-hero">
        <div className="course-hero-copy">
        <p className="course-index-label">Your learning path</p>
        <h1 className="display max-w-3xl text-4xl leading-none">{data.course.topic}</h1>
        </div>
        <Image className="course-index-art" src="/images/newton-under-apple-tree.webp" width={1254} height={1254} sizes="(max-width: 767px) 100px, 176px" alt="" aria-hidden="true" preload />
      </header>
      <div className="course-toolbar">
        <div className="course-index-progress">
        <p className="text-lg text-[var(--muted)]">{passed} of {total} chapters mastered</p>
        {total > 0 ? <div className="course-index-segments" aria-hidden="true">{data.chapters.map((chapter) => <span key={chapter.id} className={chapter.status === "passed" ? "is-mastered" : ""} />)}</div> : null}
        </div>
        <a className="button-secondary ui shrink-0" href={`/api/courses/${params.id}/export`}>Export notes</a>
      </div>
      {total === 0 ? (
        <section className="border-t border-[var(--line)] pt-6" aria-labelledby="empty-course-heading">
          <h2 id="empty-course-heading" className="display text-3xl leading-tight">No chapters available</h2>
          <p className="mt-3 text-lg text-[var(--muted)]">This course has no chapters yet.</p>
        </section>
      ) : (
        <section aria-labelledby="course-chapters-title" className="course-index-outline">
        <h2 id="course-chapters-title">Chapters</h2>
        <ol className="chapter-list divide-y divide-[var(--line)]">
          {data.chapters.map((chapter) => {
            const isOpen = chapter.status === "open";
            const isPassed = chapter.status === "passed";
            if (isPassed) return (
              <li key={chapter.id}>
                <div className="chapter-row chapter-row--mastered">
                  <span className="chapter-index-number ui text-xs font-bold" role="img" aria-label="Completed">✓</span>
                  <div className="chapter-row-copy"><span className="chapter-title text-xl">{chapter.title}</span><span className="chapter-mastered-label">Mastered</span></div>
                  <span className="chapter-row-actions ui text-xs">
                    <Link className="chapter-read" href={`/course/${params.id}/ch/${chapter.idx}`} aria-label={`Read → ${chapter.title}`}>Read →</Link>
                    <button type="button" className="text-button chapter-retake" aria-label={`Retake mastery check → ${chapter.title}`} aria-haspopup="dialog" onClick={() => openRevisitDialog(chapter)}>Retake →</button>
                  </span>
                </div>
              </li>
            );
            const content = <>
              <span className="chapter-index-number ui text-xs font-bold" aria-hidden="true">{String(chapter.idx + 1).padStart(2, "0")}</span>
              <div className="chapter-row-copy">
                <span className="chapter-title text-xl">{chapter.title}</span>
                {chapter.status === "locked" ? <UnlockGuidance chapter={chapter} chapters={data.chapters} /> : null}
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
        </section>
      )}
      {completed ? <p className="mt-8 text-xl text-[var(--success)]" role="status">You completed this course.</p> : null}
      <RevisitDialog open={Boolean(revisitChapter)} chapterTitle={revisitChapter?.title ?? "this chapter"} isSubmitting={isRevisiting} error={revisitError} onCancel={() => { if (!isRevisiting) { setRevisitChapter(null); setRevisitError(""); } }} onConfirm={() => void confirmRevisit()} />
    </main>
  );
}

function UnlockGuidance({ chapter, chapters }: { chapter: Chapter; chapters: Chapter[] }) {
  const previous = chapters.find(item => item.idx === chapter.idx - 1);
  const required = new Set(chapter.prerequisites ?? []);
  const prerequisites = chapters.filter(item => required.has(item.idx)).sort((a, b) => a.idx - b.idx);
  const missing = [...required].some(idx => !chapters.some(item => item.idx === idx));
  return <div className="ui mt-2 text-sm">
    <p>{previous
      ? `Unlocks when you pass the mastery check for “${previous.title}”${required.size ? " with all listed prerequisites mastered" : ""}.`
      : "Chapters unlock in sequence after the previous chapter’s mastery check is passed."}</p>
    {prerequisites.length ? <>
      <p className="mt-2">Required prerequisites:</p>
      <ul className="mt-1 space-y-1">{prerequisites.map(item => <li key={item.id}>{item.title}: {item.status === "passed" ? "Mastered" : "Not yet mastered"}</li>)}</ul>
    </> : null}
    {missing ? <p className="mt-2">A listed prerequisite is unavailable in this course. This chapter cannot unlock until all listed prerequisites are mastered.</p> : null}
  </div>;
}
