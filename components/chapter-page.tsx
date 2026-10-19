"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { MermaidContent } from "@/components/mermaid-content";
import { ReadingPageState } from "@/components/reading-page-state";

type CourseChapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string }; chapters: CourseChapter[] };
type ChapterResponse = { chapter: CourseChapter & { pretest: string | null }; html: string };

class ReadyContentError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status: number) {
    super(message);
    this.name = "ReadyContentError";
  }
}

async function fetchReadyJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 202) throw new ReadyContentError("generation_pending", true, 202);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; retryable?: boolean } } | null;
    throw new ReadyContentError(body?.error?.message ?? "Could not load generated content", body?.error?.retryable === true, response.status);
  }
  return response.json();
}

const retryReadyContent = (failureCount: number, error: Error) => error instanceof ReadyContentError && error.retryable && failureCount < 45;
const retryReadyContentDelay = () => 2_000;

export function ChapterPage() {
  const params = useParams<{ id: string; idx: string }>(); const queryClient = useQueryClient();
  const courseQuery = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetchReadyJson(`/api/courses/${params.id}`) });
  const chapter = courseQuery.data?.chapters.find((item) => item.idx === Number(params.idx));
  const chapterQuery = useQuery<ChapterResponse>({ queryKey: ["chapter", chapter?.id], enabled: Boolean(chapter?.id), queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}`), retry: retryReadyContent, retryDelay: retryReadyContentDelay });
  useEffect(() => {
    // Rereading completed lessons must not generate quizzes or later lessons.
    if (!chapter || chapter.status === "passed" || !chapterQuery.data || !courseQuery.data) return;
    void queryClient.prefetchQuery({
      queryKey: ["quiz-v2", params.id, params.idx],
      queryFn: () => fetchReadyJson(`/api/chapters/${chapter.id}/quiz`),
      retry: retryReadyContent,
      retryDelay: retryReadyContentDelay,
    });
    const next = courseQuery.data.chapters.find((item) => item.idx > chapter.idx && item.status === "open");
    if (next) {
      void queryClient.prefetchQuery({
        queryKey: ["chapter", next.id],
        queryFn: () => fetchReadyJson(`/api/chapters/${next.id}`),
        retry: retryReadyContent,
        retryDelay: retryReadyContentDelay,
      });
    }
  }, [chapter, chapterQuery.data, courseQuery.data, params.id, params.idx, queryClient]);
  const feedback = useMutation({ mutationFn: (difficulty: "easy" | "hard") => fetch(`/api/chapters/${chapter?.id}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty }) }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter", chapter?.id] }) });
  const regenerate = useMutation({ mutationFn: () => fetch(`/api/chapters/${chapter?.id}/regenerate`, { method: "POST" }), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter", chapter?.id] }) });
  // Recovery only re-reads the failed resource, never resets or regenerates it.
  const recovery = useMutation({ mutationFn: async () => { await (courseQuery.isError ? courseQuery.refetch() : chapterQuery.refetch()); } });
  if (!recovery.isPending && (courseQuery.isLoading || chapterQuery.isLoading)) return <ReadingPageState kind="loading" message="Loading chapter…" />;
  const loadError = courseQuery.isError ? courseQuery.error : chapterQuery.error;
  const status = loadError instanceof ReadyContentError ? loadError.status : undefined;
  const unavailable = (!courseQuery.isError && !courseQuery.isFetching && !chapter) || status === 403 || status === 404;
  if (recovery.isPending || courseQuery.isError || chapterQuery.isError || !chapterQuery.data) {
    const preparing = status === 202;
    return <ReadingPageState
      kind="failure"
      heading={recovery.isPending ? "Loading chapter" : unavailable ? "Chapter unavailable" : preparing ? "Chapter still preparing" : "Could not load chapter"}
      message={recovery.isPending ? "Trying again…" : status === 403 ? "This chapter is locked. Complete the earlier chapters before reading it." : unavailable ? "This chapter is unavailable. Return to the course to choose a chapter." : preparing ? "Your chapter is still being prepared. Try again in a moment, or return to the course while you wait." : "Could not load this chapter. Try again, or return to the course."}
      backHref={`/course/${params.id}`}
      pending={recovery.isPending}
      preparing={preparing}
      onRetry={!unavailable || recovery.isPending ? () => recovery.mutate() : undefined}
    />;
  }
  const total = courseQuery.data?.chapters.length ?? 1;
  return <main className="reading-shell"><header className="mb-12 border-b border-[var(--line)] pb-5"><div className="flex items-center justify-between gap-4"><Link href={`/course/${params.id}`} className="eyebrow underline-offset-4">← Back to course</Link><span className="ui text-xs text-[var(--muted)]">{String(Number(params.idx) + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</span></div><div className="mt-4 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--accent)]" style={{ width: `${((Number(params.idx) + 1) / total) * 100}%` }} /></div></header><MermaidContent html={chapterQuery.data.html} />{chapterQuery.data.chapter.pretest ? <p className="mt-12 border-t border-[var(--line)] pt-5 text-lg text-[var(--brown)]"><span className="font-bold text-[var(--ink)]">Before you continue.</span> {chapterQuery.data.chapter.pretest}</p> : null}<Link href={`/course/${params.id}/ch/${params.idx}/quiz`} className="button-primary ui mt-10 w-full">Check your understanding →</Link><div className="ui mt-6 flex flex-wrap justify-center gap-5 text-xs"><button type="button" onClick={() => feedback.mutate("easy")} className="text-button">Too easy</button><button type="button" onClick={() => feedback.mutate("hard")} className="text-button">Too hard</button><button type="button" onClick={() => regenerate.mutate()} disabled={regenerate.isPending} className="text-button">{regenerate.isPending ? "Regenerating…" : "Regenerate chapter"}</button></div></main>;
}
