"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { MermaidContent } from "@/components/mermaid-content";
import { ReadingPageState } from "@/components/reading-page-state";
import { SocraticSession } from "./socratic-session";

type Direction = "simpler" | "deeper";
type ExplanationLevel = 1 | 2 | 3 | 4 | 5 | 6;
type CourseChapter = { id: string; idx: number; title: string; status: "locked" | "open" | "passed" };
type CourseResponse = { course: { topic: string; qualityPolicyVersion?: number | null }; chapters: CourseChapter[] };
type ChapterResponse = {
  chapter: CourseChapter & {
    pretest: string | null;
    contentGenerationVersion?: number;
    contentGenerationStatus?: "pending" | "generating" | "ready" | "failed";
    content?: string | null;
    generatedAt?: string | null;
  };
  html: string;
};
type ExplanationTimeline = {
  canonicalVersion: number;
  baselineExplanationId: string | null;
  effectiveLevel: ExplanationLevel;
  legacyBaseline: boolean;
  sections: {
    id: string;
    ordinal: number;
    kind: "original" | "alternative" | "legacy";
    sourceContentVersion: number;
    level: ExplanationLevel | null;
    label: string | null;
    content: string | null;
    html: string;
  }[];
  activeRequest: { id: string; status: "pending" | "generating"; level: ExplanationLevel | null } | null;
  failedRequest: { id: string; status: "failed"; level: ExplanationLevel | null; jobVersion: number } | null;
};

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

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const result = await response.json().catch(() => null) as { error?: { message?: string } } | null;
    throw new Error(result?.error?.message ?? "Could not update the chapter.");
  }
  return response.json();
}

const retryReadyContent = (failureCount: number, error: Error) => error instanceof ReadyContentError && !error.generationFailed && error.retryable && failureCount < 45;
const retryReadyContentDelay = () => 2_000;

function sectionHeading(section: ExplanationTimeline["sections"][number]) {
  if (section.level === null || !section.label) {
    return section.kind === "original" ? "Original explanation" : "Explanation";
  }
  return section.kind === "original" ? `Original explanation · ${section.label}` : `${section.label} explanation`;
}

export function ChapterPage() {
  const params = useParams<{ id: string; idx: string }>();
  const queryClient = useQueryClient();
  const courseQuery = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetchReadyJson(`/api/courses/${params.id}`) });
  const chapter = courseQuery.data?.chapters.find((item) => item.idx === Number(params.idx));
  const reviewed = Boolean(courseQuery.data?.course.qualityPolicyVersion);
  const chapterQuery = useQuery<ChapterResponse>({
    queryKey: ["chapter", chapter?.id],
    enabled: Boolean(chapter?.id),
    queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}`),
    retry: (count, error) => reviewed && error instanceof ReadyContentError && error.status === 202 ? true : retryReadyContent(count, error),
    retryDelay: retryReadyContentDelay,
    refetchInterval: (query) => ["pending", "generating"].includes(query.state.data?.chapter.contentGenerationStatus ?? "") ? 2_000 : false,
  });
  const explanationQuery = useQuery<ExplanationTimeline>({
    queryKey: ["chapter-explanations", chapter?.id],
    enabled: Boolean(chapterQuery.data?.chapter.id),
    queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}/explanations`),
    retry: (count, error) => retryReadyContent(count, error),
    retryDelay: retryReadyContentDelay,
    refetchInterval: (query) => query.state.data?.activeRequest ? 2_000 : false,
  });
  const timeline = explanationQuery.data;
  const chapterStatus = chapterQuery.data?.chapter.contentGenerationStatus;
  const legacyReady = chapterStatus === "pending" && chapterQuery.data?.chapter.contentGenerationVersion === 1 && Boolean(chapterQuery.data.chapter.generatedAt);
  const preparingVersion = ["pending", "generating"].includes(chapterStatus ?? "") && !legacyReady;
  const failedVersion = chapterStatus === "failed";
  const effectiveLevel = timeline?.effectiveLevel ?? 2;
  const activeExplanation = Boolean(timeline?.activeRequest);
  const baselineAvailable = Boolean(timeline?.baselineExplanationId)
    && timeline?.canonicalVersion === chapterQuery.data?.chapter.contentGenerationVersion
    && !preparingVersion && !failedVersion && !activeExplanation;
  const hardBlockAdjustments = !timeline?.baselineExplanationId
    || timeline?.canonicalVersion !== chapterQuery.data?.chapter.contentGenerationVersion
    || preparingVersion || failedVersion;

  useEffect(() => {
    // Keep the existing deliberate assessment prefetch, but pause while an alternative is active.
    if (!chapter || chapter.status === "passed" || preparingVersion || failedVersion || activeExplanation || !chapterQuery.data || !courseQuery.data) return;
    void queryClient.prefetchQuery({
      queryKey: ["quiz-v2", params.id, params.idx],
      queryFn: () => fetchReadyJson(`/api/chapters/${chapter.id}/quiz`),
      retry: retryReadyContent,
      retryDelay: retryReadyContentDelay,
    });
    const next = courseQuery.data.chapters.find((item) => item.idx > chapter.idx && item.status === "open");
    if (next) void queryClient.prefetchQuery({
      queryKey: ["chapter", next.id],
      queryFn: () => fetchReadyJson(`/api/chapters/${next.id}`),
      retry: retryReadyContent,
      retryDelay: retryReadyContentDelay,
    });
  }, [chapter, chapterQuery.data, courseQuery.data, params.id, params.idx, queryClient, preparingVersion, failedVersion, activeExplanation]);

  const requestExplanation = useMutation({
    mutationFn: async (direction: Direction) => {
      if (!timeline?.baselineExplanationId) throw new Error("The current explanation is not ready yet.");
      return postJson<{ id: string; level: ExplanationLevel; status: string }>(`/api/chapters/${chapter?.id}/explanations`, {
        direction,
        requestId: crypto.randomUUID(),
        expectedContentVersion: timeline.canonicalVersion,
        baselineExplanationId: timeline.baselineExplanationId,
      });
    },
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter-explanations", chapter?.id] }),
  });
  const retryExplanation = useMutation({
    mutationFn: async () => {
      if (!timeline?.failedRequest) throw new Error("There is no failed explanation to retry.");
      return postJson<{ id: string; level: ExplanationLevel; status: string }>(
        `/api/chapters/${chapter?.id}/explanations/${timeline.failedRequest.id}/retry`,
        { requestId: crypto.randomUUID(), expectedJobVersion: timeline.failedRequest.jobVersion },
      );
    },
    retry: false,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["chapter-explanations", chapter?.id] }),
  });
  // Only an explicit recovery action restarts a terminally failed reviewed artifact.
  const recovery = useMutation({ mutationFn: async () => {
    if (reviewed && chapterQuery.error instanceof ReadyContentError && chapterQuery.error.generationFailed) {
      await postJson(`/api/chapters/${chapter?.id}/regenerate`);
    }
    await (courseQuery.isError ? courseQuery.refetch() : chapterQuery.refetch());
  }, retry: false });
  if (reviewed && chapterQuery.failureReason instanceof ReadyContentError && chapterQuery.failureReason.status === 202 && !chapterQuery.data) return <ReadingPageState kind="failure" heading="Chapter still preparing" message="Your chapter is being written and reviewed. You can return to the course while preparation continues." preparing />;
  if (!recovery.isPending && (courseQuery.isLoading || chapterQuery.isLoading)) return <ReadingPageState kind="loading" message="Loading chapter…" />;
  const loadError = courseQuery.isError ? courseQuery.error : chapterQuery.error;
  const status = loadError instanceof ReadyContentError ? loadError.status : undefined;
  const unavailable = (!courseQuery.isError && !courseQuery.isFetching && !chapter) || status === 403 || status === 404;
  if (recovery.isPending || courseQuery.isError || (chapterQuery.isError && !chapterQuery.data) || !chapterQuery.data) {
    const preparing = status === 202;
    return <ReadingPageState
      kind="failure"
      heading={recovery.isPending ? "Loading chapter" : unavailable ? "Chapter unavailable" : preparing ? "Chapter still preparing" : "Could not load chapter"}
      message={recovery.isError ? recovery.error.message : recovery.isPending ? "Trying again…" : status === 403 ? "This chapter is locked. Complete the earlier chapters before reading it." : unavailable ? "This chapter is unavailable. Return to the course to choose a chapter." : preparing ? "Your chapter is still being prepared. Try again in a moment, or return to the course while you wait." : "Could not load this chapter. Try again, or return to the course."}
      pending={recovery.isPending}
      preparing={preparing}
      onRetry={!unavailable || recovery.isPending ? () => recovery.mutate() : undefined}
    />;
  }

  const sections = timeline?.sections ?? [];
  const currentSection = [...sections].reverse().find((section) => section.level === timeline?.effectiveLevel)
    ?? sections.find((section) => section.id === timeline?.baselineExplanationId);
  const requestInFlight = requestExplanation.isPending || retryExplanation.isPending || activeExplanation;
  const controlsDisabled = hardBlockAdjustments || activeExplanation || requestExplanation.isPending || retryExplanation.isPending;
  const requestMessage = requestExplanation.isPending
    ? "Requesting explanation…"
    : retryExplanation.isPending
      ? "Retrying explanation…"
      : activeExplanation
        ? `Preparing the ${timeline?.activeRequest?.level ? sections.find((section) => section.level === timeline.activeRequest?.level)?.label ?? "requested level" : "requested explanation"}. Earlier explanations remain available above.`
        : requestExplanation.isSuccess && sections.some((section) => section.id === requestExplanation.data.id)
          ? `${sections.find((section) => section.id === requestExplanation.data.id)?.label ?? "New"} explanation added below the earlier text.`
          : retryExplanation.isSuccess && sections.some((section) => section.id === retryExplanation.data.id)
            ? "Explanation added. Earlier text remains available above."
            : "";
  const atSimplest = Boolean(baselineAvailable && effectiveLevel === 1);
  const atDeepest = Boolean(baselineAvailable && effectiveLevel === 6);
  const retryAccepted = retryExplanation.isSuccess && sections.some((section) => section.id === retryExplanation.data.id);
  const showRetryButton = Boolean(timeline?.failedRequest || retryExplanation.isPending || (retryExplanation.isSuccess && !retryAccepted));

  const courseChapters = courseQuery.data?.chapters ?? [];

  return <><main id="main-content" tabIndex={-1} className="reading-shell chapter-reader">
    <div className="reader-content">
    <header className="reader-heading">
      <div className="reader-chapter-meta">
        <p>Chapter {Number(params.idx) + 1} of {courseChapters.length}</p>
        <span className={`reader-status${chapter?.status === "passed" ? " reader-status--mastered" : ""}`}>{chapter?.status === "passed" ? "Mastered" : "In progress"}</span>
      </div>
      <div className="reader-title-row">
        <h1 className="display lesson-title">{chapterQuery.data.chapter.title}</h1>
      </div>
    </header>
    {!preparingVersion && !failedVersion ? <SocraticSession key={`${chapterQuery.data.chapter.id}:${chapterQuery.data.chapter.contentGenerationVersion ?? 1}`} chapterId={chapterQuery.data.chapter.id} version={chapterQuery.data.chapter.contentGenerationVersion ?? 1} /> : null}

    {sections.length ? sections.map((section) => (
      <section key={section.id} aria-labelledby={`explanation-${section.id}`} className={section.ordinal > 1 ? "mt-12 border-t border-[var(--line)] pt-8" : ""}>
        <h2 id={`explanation-${section.id}`} className="display mb-6 text-2xl">{sectionHeading(section)}</h2>
        <MermaidContent html={section.html} />
      </section>
    )) : <MermaidContent html={chapterQuery.data.html} />}

    {preparingVersion ? <p role="status" className="ui mt-8 text-sm text-[var(--muted)]">Preparing the original explanation. Earlier accepted explanations remain available above.</p> : failedVersion ? <p role="alert" className="ui mt-8 text-sm">Could not prepare the new chapter version. Your earlier explanations remain available above.</p> : null}
    {chapterQuery.data.chapter.pretest ? <p className="mt-12 border-t border-[var(--line)] pt-5 text-lg text-[var(--brown)]"><span className="font-bold text-[var(--ink)]">Before you continue.</span> {chapterQuery.data.chapter.pretest}</p> : null}

    <section aria-label="Explanation controls" className="reader-controls ui mt-7 border-t border-[var(--line)] pt-5">
      {currentSection && currentSection.level !== null && currentSection.label
        ? <p className="mb-3 text-sm text-[var(--muted)]">Current explanation: {currentSection.label} ({currentSection.level} of 6)</p>
        : !timeline?.legacyBaseline
          ? <p className="mb-3 text-sm text-[var(--muted)]">The current explanation level is not available yet.</p>
          : null}
      <div className="chapter-action-row">
        <div className="chapter-adjustment-group">
          <div role="group" aria-label="Adjust explanation depth" className="chapter-adjustment-buttons">
            <button type="button" onClick={() => { if (!controlsDisabled && effectiveLevel > 1) requestExplanation.mutate("simpler"); }} aria-disabled={controlsDisabled || effectiveLevel <= 1} className="button-secondary chapter-explanation-button aria-disabled:cursor-not-allowed aria-disabled:opacity-60">Simplify explanation</button>
            <button type="button" onClick={() => { if (!controlsDisabled && effectiveLevel < 6) requestExplanation.mutate("deeper"); }} aria-disabled={controlsDisabled || effectiveLevel >= 6} className="button-secondary chapter-explanation-button aria-disabled:cursor-not-allowed aria-disabled:opacity-60">Explain in more depth</button>
          </div>
        </div>
        <Link href={`/course/${params.id}/ch/${params.idx}/quiz`} className="button-primary ui chapter-quiz-cta">Check your understanding →</Link>
      </div>
      {showRetryButton ? <button type="button" onClick={() => { if (!requestInFlight) retryExplanation.mutate(); }} aria-disabled={requestInFlight} className="text-button mt-2 aria-disabled:cursor-wait aria-disabled:opacity-60">
        {retryExplanation.isPending || activeExplanation ? "Retrying explanation…" : "Retry explanation"}
      </button> : retryAccepted ? <p className="mt-2 text-sm text-[var(--muted)]" role="status">Explanation added</p> : null}
      {timeline?.failedRequest && !activeExplanation ? <p className="mt-2 text-sm text-[var(--accent-dark)]">The new explanation could not be prepared. Your accepted text is unchanged.</p> : null}
      {atSimplest ? <p className="mt-2 text-sm text-[var(--muted)]">This is the simplest level (1 of 6).</p> : atDeepest ? <p className="mt-2 text-sm text-[var(--muted)]">This is the deepest level (6 of 6).</p> : null}
      <p role="status" aria-live="polite" className="mt-3 text-sm text-[var(--muted)]">{requestMessage}</p>
      {requestExplanation.isError || retryExplanation.isError ? <p role="alert" className="mt-3 text-sm text-[var(--accent-dark)]">{requestExplanation.error?.message ?? retryExplanation.error?.message}</p> : null}
      {explanationQuery.isError ? <div role="alert" className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-[var(--accent-dark)]">
        <span>Could not refresh explanation status. Your accepted text remains available.</span>
        <button type="button" className="text-button" onClick={() => void explanationQuery.refetch()}>Retry status check</button>
      </div> : null}
    </section>

    </div>
  </main></>;
}
