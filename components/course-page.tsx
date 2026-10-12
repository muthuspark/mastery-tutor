"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { RevisitDialog } from "@/components/revisit-dialog";

type Chapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string }; chapters: Chapter[]; progress: { passed: number; total: number } };

export function CoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [revisitChapter, setRevisitChapter] = useState<Chapter | null>(null);
  const [isRevisiting, setIsRevisiting] = useState(false);
  const [revisitError, setRevisitError] = useState("");
  const { data, isLoading, isError } = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => { if (!response.ok) throw new Error("Could not load course"); return response.json(); }) });
  if (isLoading) return <main className="reading-shell ui text-sm text-[var(--muted)]">Loading course…</main>;
  if (isError || !data) return <main className="reading-shell ui text-sm text-[var(--accent-dark)]">Could not load this course.</main>;
  const current = data.chapters.find((chapter) => chapter.status === "open");
  const percent = Math.round((data.progress.passed / data.progress.total) * 100);
  function openRevisitDialog(chapter: Chapter, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
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
      <header className="border-b border-[var(--line)] pb-7"><Link className="eyebrow no-underline hover:text-[var(--accent-dark)]" href="/">Mastery Tutor</Link><div className="mt-10 flex flex-wrap items-end justify-between gap-6"><div><p className="ui text-xs uppercase tracking-[0.1em] text-[var(--muted)]">A course in</p><h1 className="display mt-2 max-w-3xl text-5xl leading-none md:text-6xl">{data.course.topic}</h1></div><div className="ui min-w-44 text-sm text-[var(--muted)]"><div className="flex justify-between"><span>Progress</span><span>{percent}%</span></div><div className="mt-2 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div></div></div></header>
      <div className="flex items-center justify-between gap-4 py-5"><p className="text-lg text-[var(--muted)]">{data.progress.passed} of {data.progress.total} chapters mastered</p><a className="button-secondary ui" href={`/api/courses/${params.id}/export`}>Export notes</a></div>
      <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{data.chapters.map((chapter) => { const isOpen = chapter.status === "open"; const isNavigable = chapter.status !== "locked"; const row = <li className={`flex items-center gap-5 py-5 ${isOpen ? "text-[var(--accent)]" : chapter.status === "locked" ? "text-[var(--muted)]" : ""}`} key={chapter.id}><span className="ui w-8 text-xs font-bold">{chapter.status === "passed" ? "✓" : String(chapter.idx + 1).padStart(2, "0")}</span><span className="flex-1 text-xl">{chapter.title}</span>{chapter.status === "passed" ? <span className="ui text-xs text-[var(--success)]">Mastered</span> : null}{isOpen ? <span className="ui text-xs font-bold">Continue →</span> : chapter.status === "passed" ? <span className="ui text-xs font-bold">Revisit →</span> : null}</li>; return isNavigable ? <Link className="block no-underline hover:bg-[var(--paper-deep)]" href={`/course/${params.id}/ch/${chapter.idx}`} onClick={chapter.status === "passed" ? (event) => openRevisitDialog(chapter, event) : undefined} key={chapter.id}>{row}</Link> : row; })}</ol>
      {!current ? <p className="mt-8 text-xl text-[var(--success)]">You completed this course.</p> : null}
      <RevisitDialog open={Boolean(revisitChapter)} chapterTitle={revisitChapter?.title ?? "this chapter"} isSubmitting={isRevisiting} error={revisitError} onCancel={() => { if (!isRevisiting) { setRevisitChapter(null); setRevisitError(""); } }} onConfirm={() => void confirmRevisit()} />
    </main>
  );
}
