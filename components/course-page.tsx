"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

type Chapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string }; chapters: Chapter[]; progress: { passed: number; total: number } };

export function CoursePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [revisitingChapterId, setRevisitingChapterId] = useState<string | null>(null);
  const { data, isLoading, isError } = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => { if (!response.ok) throw new Error("Could not load course"); return response.json(); }) });
  if (isLoading) return <main className="reading-shell ui text-sm text-[var(--muted)]">Loading course…</main>;
  if (isError || !data) return <main className="reading-shell ui text-sm text-[var(--accent-dark)]">Could not load this course.</main>;
  const current = data.chapters.find((chapter) => chapter.status === "open");
  const percent = Math.round((data.progress.passed / data.progress.total) * 100);
  async function revisitChapter(chapter: Chapter, event: React.MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const confirmed = window.confirm("Revisit this mastered chapter? Your mastery result and quiz questions will be reset, and new questions will be generated.");
    if (!confirmed) return;
    setRevisitingChapterId(chapter.id);
    try {
      const response = await fetch(`/api/chapters/${chapter.id}/revisit`, { method: "POST" });
      if (!response.ok) throw new Error("Could not reset this chapter");
      router.push(`/course/${params.id}/ch/${chapter.idx}`);
    } catch {
      setRevisitingChapterId(null);
      window.alert("Could not reset this chapter. Please try again.");
    }
  }
  return (
    <main className="page-shell">
      <header className="border-b border-[var(--line)] pb-7"><Link className="eyebrow no-underline hover:text-[var(--accent-dark)]" href="/">Mastery Tutor</Link><div className="mt-10 flex flex-wrap items-end justify-between gap-6"><div><p className="ui text-xs uppercase tracking-[0.1em] text-[var(--muted)]">A course in</p><h1 className="display mt-2 max-w-3xl text-5xl leading-none md:text-6xl">{data.course.topic}</h1></div><div className="ui min-w-44 text-sm text-[var(--muted)]"><div className="flex justify-between"><span>Progress</span><span>{percent}%</span></div><div className="mt-2 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--accent)]" style={{ width: `${percent}%` }} /></div></div></div></header>
      <div className="flex items-center justify-between gap-4 py-5"><p className="text-lg text-[var(--muted)]">{data.progress.passed} of {data.progress.total} chapters mastered</p><a className="button-secondary ui" href={`/api/courses/${params.id}/export`}>Export notes</a></div>
      <ol className="divide-y divide-[var(--line)] border-y border-[var(--line)]">{data.chapters.map((chapter) => { const isOpen = chapter.status === "open"; const isNavigable = chapter.status !== "locked"; const row = <li className={`flex items-center gap-5 py-5 ${isOpen ? "text-[var(--accent)]" : chapter.status === "locked" ? "text-[var(--muted)]" : ""}`} key={chapter.id}><span className="ui w-8 text-xs font-bold">{chapter.status === "passed" ? "✓" : String(chapter.idx + 1).padStart(2, "0")}</span><span className="flex-1 text-xl">{chapter.title}</span>{chapter.status === "passed" ? <span className="ui text-xs text-[var(--success)]">Mastered</span> : null}{isOpen ? <span className="ui text-xs font-bold">Continue →</span> : chapter.status === "passed" ? <span className="ui text-xs font-bold">{revisitingChapterId === chapter.id ? "Resetting…" : "Revisit →"}</span> : null}</li>; return isNavigable ? <Link className="block no-underline hover:bg-[var(--paper-deep)]" href={`/course/${params.id}/ch/${chapter.idx}`} onClick={chapter.status === "passed" ? (event) => void revisitChapter(chapter, event) : undefined} key={chapter.id}>{row}</Link> : row; })}</ol>
      {!current ? <p className="mt-8 text-xl text-[var(--success)]">You completed this course.</p> : null}
    </main>
  );
}
