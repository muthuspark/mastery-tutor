"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { MermaidContent } from "@/components/mermaid-content";
import { ReadingPageState } from "@/components/reading-page-state";
import { BackLink } from "./back-link";

type ChapterAdjustment = "easy" | "hard" | "regenerate";

type CourseChapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string; qualityPolicyVersion?: number | null }; chapters: CourseChapter[] };
type ChapterResponse = { chapter: CourseChapter & { pretest: string | null }; html: string };

class ReadyContentError extends Error {
  constructor(message: string, readonly retryable: boolean, readonly status: number, readonly generationFailed = false) {
    super(message);
    this.name = "ReadyContentError";
  }
}

async function fetchReadyJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 202) throw new ReadyContentError("generation_pending", true, 202);
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: { message?: string; retryable?: boolean; code?: string } } | null;
    throw new ReadyContentError(body?.error?.message ?? "Could not load generated content", body?.error?.retryable === true, response.status, body?.error?.code === "generation_failed");
  }
  return response.json();
}

const retryReadyContent = (failureCount: number, error: Error) => error instanceof ReadyContentError && !error.generationFailed && error.retryable && failureCount < 45;
const retryReadyContentDelay = () => 2_000;

export function ChapterPage() {
  const params = useParams<{ id: string; idx: string }>(); const queryClient = useQueryClient();
  const courseQuery = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetchReadyJson(`/api/courses/${params.id}`) });
  const chapter = courseQuery.data?.chapters.find((item) => item.idx === Number(params.idx));
  const reviewed = Boolean(courseQuery.data?.course.qualityPolicyVersion);
  const chapterQuery = useQuery<ChapterResponse>({ queryKey: ["chapter", chapter?.id], enabled: Boolean(chapter?.id), queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}`), retry: (count, error) => reviewed && error instanceof ReadyContentError && error.status === 202 ? true : retryReadyContent(count, error), retryDelay: retryReadyContentDelay });
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
  const adjustment = useMutation({
    mutationFn: async (action: ChapterAdjustment) => {
      const response = await fetch(`/api/chapters/${chapter?.id}${action === "regenerate" ? "/regenerate" : ""}`, {
        method: "POST",
        ...(action !== "regenerate" ? { headers: { "content-type": "application/json" }, body: JSON.stringify({ difficulty: action }) } : {}),
      });
      if (!response.ok) throw new Error("Chapter adjustment failed");
      return response.status;
    },
    // An explicit learner action is required to retry any adjustment.
    retry: false,
    onSuccess: () => reviewed ? queryClient.resetQueries({ queryKey: ["chapter", chapter?.id] }) : queryClient.invalidateQueries({ queryKey: ["chapter", chapter?.id] }),
  });
  // Only an explicit recovery action restarts a terminally failed reviewed artifact.
  const recovery = useMutation({ mutationFn: async () => {
    if (reviewed && chapterQuery.error instanceof ReadyContentError && chapterQuery.error.generationFailed) {
      const response = await fetch(`/api/chapters/${chapter?.id}/regenerate`, { method: "POST" });
      if (!response.ok) throw new Error("Could not restart chapter preparation. Try again.");
    }
    await (courseQuery.isError ? courseQuery.refetch() : chapterQuery.refetch());
  }, retry: false });
  if (reviewed && chapterQuery.failureReason instanceof ReadyContentError && chapterQuery.failureReason.status === 202 && !chapterQuery.data) return <ReadingPageState kind="failure" heading="Chapter still preparing" message="Your chapter is being written and reviewed. You can return to the course while preparation continues." backHref={`/course/${params.id}`} preparing />;
  if (!recovery.isPending && (courseQuery.isLoading || chapterQuery.isLoading)) return <ReadingPageState kind="loading" message="Loading chapter…" />;
  const loadError = courseQuery.isError ? courseQuery.error : chapterQuery.error;
  const status = loadError instanceof ReadyContentError ? loadError.status : undefined;
  const unavailable = (!courseQuery.isError && !courseQuery.isFetching && !chapter) || status === 403 || status === 404;
  if (recovery.isPending || courseQuery.isError || chapterQuery.isError || !chapterQuery.data) {
    const preparing = status === 202;
    return <ReadingPageState
      kind="failure"
      heading={recovery.isPending ? "Loading chapter" : unavailable ? "Chapter unavailable" : preparing ? "Chapter still preparing" : "Could not load chapter"}
      message={recovery.isError ? recovery.error.message : recovery.isPending ? "Trying again…" : status === 403 ? "This chapter is locked. Complete the earlier chapters before reading it." : unavailable ? "This chapter is unavailable. Return to the course to choose a chapter." : preparing ? "Your chapter is still being prepared. Try again in a moment, or return to the course while you wait." : "Could not load this chapter. Try again, or return to the course."}
      backHref={`/course/${params.id}`}
      pending={recovery.isPending}
      preparing={preparing}
      onRetry={!unavailable || recovery.isPending ? () => recovery.mutate() : undefined}
    />;
  }
  let adjustmentMessage = "";
  if (adjustment.isPending) {
    adjustmentMessage = adjustment.variables === "regenerate" ? "Regenerating chapter…" : "Saving difficulty feedback and updating chapter…";
  } else if (adjustment.isSuccess) {
    if (adjustment.variables === "regenerate") {
      adjustmentMessage = adjustment.data === 202 ? "Chapter regeneration requested. The chapter is being prepared." : "Chapter regenerated.";
    } else {
      adjustmentMessage = `Feedback saved: too ${adjustment.variables}. Chapter update requested.`;
    }
  }
  return <><main id="main-content" tabIndex={-1} className="reading-shell"><nav aria-label="Back navigation" className="mb-6"><BackLink href={`/course/${params.id}`}>Back to course</BackLink></nav><h1 className="display lesson-title">{chapterQuery.data.chapter.title}</h1><MermaidContent html={chapterQuery.data.html} />{chapterQuery.data.chapter.pretest ? <p className="mt-12 border-t border-[var(--line)] pt-5 text-lg text-[var(--brown)]"><span className="font-bold text-[var(--ink)]">Before you continue.</span> {chapterQuery.data.chapter.pretest}</p> : null}<Link href={`/course/${params.id}/ch/${params.idx}/quiz`} className="button-primary ui mt-10 w-full">Check your understanding →</Link><section aria-label="Chapter adjustments" className="ui mt-6 text-center">
    <div className="flex flex-wrap justify-center gap-5 text-xs">
      <button type="button" onClick={() => adjustment.mutate("easy")} disabled={adjustment.isPending} className="text-button disabled:cursor-wait disabled:opacity-60">Too easy</button>
      <button type="button" onClick={() => adjustment.mutate("hard")} disabled={adjustment.isPending} className="text-button disabled:cursor-wait disabled:opacity-60">Too hard</button>
      <button type="button" onClick={() => adjustment.mutate("regenerate")} disabled={adjustment.isPending} className="text-button disabled:cursor-wait disabled:opacity-60">{adjustment.isPending && adjustment.variables === "regenerate" ? "Regenerating…" : "Regenerate chapter"}</button>
    </div>
    <p role="status" className={`mt-4 text-sm ${adjustment.isSuccess ? "text-[var(--success)]" : "text-[var(--muted)]"}`}>
      {adjustmentMessage}
    </p>
    {adjustment.isError ? <p role="alert" className="mt-4 text-sm text-[var(--accent-dark)]">
      {adjustment.variables === "regenerate" ? "Could not regenerate this chapter. Select Regenerate chapter to try again." : `Could not save difficulty feedback. Select Too ${adjustment.variables} to try again.`}
    </p> : null}
  </section></main></>;
}
