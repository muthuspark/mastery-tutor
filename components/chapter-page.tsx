"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

type CourseChapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string }; chapters: CourseChapter[] };
type ChapterResponse = { chapter: CourseChapter & { pretest: string | null }; html: string };

export function ChapterPage() {
  const params = useParams<{ id: string; idx: string }>(); const queryClient = useQueryClient();
  const courseQuery = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetch(`/api/courses/${params.id}`).then((response) => response.json()) });
  const chapter = courseQuery.data?.chapters.find((item) => item.idx === Number(params.idx));
  const chapterQuery = useQuery<ChapterResponse>({ queryKey: ["chapter", chapter?.id], enabled: Boolean(chapter?.id), queryFn: () => fetch(`/api/chapters/${chapter?.id}`).then((response) => { if (!response.ok) throw new Error("Could not load chapter"); return response.json(); }) });
  const feedback = useMutation({ mutationFn: (difficulty: "easy" | "hard") => fetch(`/api/chapters/${chapter?.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter", chapter?.id] }) });
  const regenerate = useMutation({ mutationFn: () => fetch(`/api/chapters/${chapter?.id}/regenerate`, { method: "POST" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter", chapter?.id] }) });
  if (courseQuery.isLoading || chapterQuery.isLoading) return <main className="reading-shell ui text-sm text-[var(--muted)]">Loading chapter…</main>;
  if (courseQuery.isError || chapterQuery.isError || !chapterQuery.data) return <main className="reading-shell ui text-sm text-[var(--accent-dark)]">Could not load this chapter.</main>;
  const total = courseQuery.data?.chapters.length ?? 1;
  return <main className="reading-shell"><header className="mb-12 border-b border-[var(--line)] pb-5"><div className="flex items-center justify-between gap-4"><Link href={`/course/${params.id}`} className="eyebrow no-underline hover:text-[var(--accent-dark)]">Mastery Tutor</Link><span className="ui text-xs text-[var(--muted)]">{String(Number(params.idx) + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div><div className="mt-4 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--accent)]" style={{ width: `${((Number(params.idx) + 1) / total) * 100}%` }} /></div></header><article className="prose prose-lg prose-editorial max-w-none prose-headings:font-[var(--display)] prose-headings:font-bold prose-headings:tracking-tight prose-a:text-[var(--accent)]" dangerouslySetInnerHTML={{ __html: chapterQuery.data.html }} />{chapterQuery.data.chapter.pretest ? <p className="mt-12 border-t border-[var(--line)] pt-5 text-lg text-[var(--brown)]"><span className="font-bold text-[var(--ink)]">Before you continue.</span> {chapterQuery.data.chapter.pretest}</p> : null}<Link href={`/course/${params.id}/ch/${params.idx}/quiz`} className="button-primary ui mt-10 w-full">Check your understanding →</Link><div className="ui mt-6 flex flex-wrap justify-center gap-5 text-xs"><button type="button" onClick={() => feedback.mutate("easy")} className="text-button">Too easy</button><button type="button" onClick={() => feedback.mutate("hard")} className="text-button">Too hard</button><button type="button" onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="text-button">{regenerate.isPending ? "Regenerating…" : "Regenerate chapter"}</button></div></main>;
}
