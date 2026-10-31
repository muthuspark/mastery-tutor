"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import styles from "./quiz-results.module.css";

type Question = { id: string; type: "mcq"; prompt: string; options: string[]; isReview: boolean };
type QuizResponse = { assessmentId: string; questions: Question[] };
type CourseChapter = { id: string; idx: number; status: "locked" | "open" | "passed" };
type CourseResponse = { course?: { qualityPolicyVersion?: number | null }; chapters: CourseChapter[] };
type Result = { remediation?: string | null; score: number; passed: boolean; complete?: boolean; nextChapterIdx?: number | null; answers: { prompt: string; response: string; score: number; feedback: string; modelAnswer: string; missedConcept: string | null }[] };

class QuizLoadError extends Error {
  constructor(readonly status: number, readonly retryable: boolean, readonly generationFailed = false, message?: string) {
    super(status === 202 ? "generation_pending" : message || "Could not load this QnA");
  }
}

async function fetchReadyJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 202 || !response.ok) {
    const body = await response.json().catch(() => null) as { error?: { retryable?: boolean; code?: string; message?: string } } | null;
    throw new QuizLoadError(response.status, response.status === 202 || body?.error?.retryable === true, body?.error?.code === "generation_failed", body?.error?.message);
  }
  return response.json();
}

const retryReadyContent = (failureCount: number, error: Error) => error instanceof QuizLoadError && !error.generationFailed && error.retryable && failureCount < 4;
const retryReadyContentDelay = () => 100;

export function QuizPage() {
  const params = useParams<{ id: string; idx: string }>(); const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0); const [responses, setResponses] = useState<Record<string, string>>({}); const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false); const [gradingStage, setGradingStage] = useState(0); const [stale, setStale] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const promptId = useId();
  const promptRef = useRef<HTMLHeadingElement>(null);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const focusPromptOnNavigation = useRef(false);
  useEffect(() => {
    // Validation owns focus; ordinary navigation must not override its explanation.
    if (error) errorRef.current?.focus();
    else if (result) resultRef.current?.focus();
    else if (focusPromptOnNavigation.current) promptRef.current?.focus();
    focusPromptOnNavigation.current = false;
  }, [error, currentIndex, result]);
  function navigateQuestion(index: number) {
    focusPromptOnNavigation.current = true;
    setError("");
    setCurrentIndex(index);
  }
  const gradingMessages = ["Sending your answers…", "Codex is reading your responses…", "Comparing them with the rubric…", "Saving your result…"];
  useEffect(() => { if (!isSubmitting) return; const timer = window.setInterval(() => setGradingStage((stage) => (stage + 1) % gradingMessages.length), 3500); return () => window.clearInterval(timer); }, [isSubmitting, gradingMessages.length]);
  const courseQuery = useQuery<CourseResponse>({ queryKey: ["course", params.id], queryFn: () => fetchReadyJson(`/api/courses/${params.id}`), retry: false });
  const chapter = courseQuery.data?.chapters.find((item) => item.idx === Number(params.idx));
  const reviewed = Boolean(courseQuery.data?.course?.qualityPolicyVersion);
  const quiz = useQuery<QuizResponse>({ queryKey: ["quiz-v2", params.id, params.idx], enabled: Boolean(chapter?.id) && chapter?.status !== "locked", queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}/quiz`), retry: (count, error) => reviewed && error instanceof QuizLoadError && error.status === 202 ? true : retryReadyContent(count, error), retryDelay: reviewed ? () => 2_000 : retryReadyContentDelay, refetchOnWindowFocus: false });
  const recovery = useMutation({ mutationFn: async () => {
    if (reviewed && quiz.error instanceof QuizLoadError && quiz.error.generationFailed) {
      const response = await fetch(`/api/chapters/${chapter?.id}/quiz/retry`, { method: "POST" });
      if (!response.ok) throw new Error("Could not restart quiz preparation. Try again.");
    }
    await (courseQuery.isError ? courseQuery.refetch() : quiz.refetch());
  }, retry: false });
  useEffect(() => {
    if (!quiz.data || !chapter || !courseQuery.data) return;
    const next = courseQuery.data.chapters.find((item) => item.idx > chapter.idx && item.status === "open");
    if (next) {
      void queryClient.prefetchQuery({
        queryKey: ["chapter", next.id],
        queryFn: () => fetchReadyJson(`/api/chapters/${next.id}`),
        retry: retryReadyContent,
        retryDelay: retryReadyContentDelay,
      });
    }
  }, [chapter, courseQuery.data, params.id, quiz.data, queryClient]);
  const questions = quiz.data?.questions ?? []; const question = questions[currentIndex];
  async function submit() {
    if (isSubmitting) return;
    const unansweredIndex = questions.findIndex((item) => !responses[item.id]?.trim());
    if (unansweredIndex !== -1) {
      setCurrentIndex(unansweredIndex);
      setError(`Answer question ${unansweredIndex + 1} before submitting. Your other answers are saved.`);
      return;
    }
    setError(""); setIsSubmitting(true); setGradingStage(0);
    try {
      if (!chapter) throw new Error("Could not find chapter");
      const response = await fetch(`/api/chapters/${chapter.id}/attempts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ assessmentId: quiz.data?.assessmentId, answers: questions.map((item) => ({ questionId: item.id, response: responses[item.id] })) }) });
      const body = await response.json();
      if (!response.ok) { if (response.status === 409 || response.status === 404) setStale(true); setError(body?.error?.message ?? "Could not submit the QnA."); return; }
      setResult(body);
      void queryClient.invalidateQueries({ queryKey: ["study"] });
      void queryClient.invalidateQueries({ queryKey: ["courses"] });
    } catch { setError("Could not reach the tutor. Please try again."); }
    finally { setIsSubmitting(false); }
  }
  if (reviewed && quiz.failureReason instanceof QuizLoadError && quiz.failureReason.status === 202 && !quiz.data) return <main id="main-content" tabIndex={-1} className="reading-shell"><h1 className="display text-4xl">QnA still preparing</h1><p role="status" className="ui mt-5 text-sm text-[var(--muted)]">Your questions are being written and reviewed. You can return to the chapter while preparation continues.</p></main>;
  if (recovery.isPending || courseQuery.isLoading || quiz.isLoading || (courseQuery.isError && courseQuery.isFetching) || (quiz.isError && quiz.isFetching)) {
    return <main id="main-content" tabIndex={-1} className="reading-shell ui text-sm text-[var(--muted)]"><p role="status" className="loading-state">{courseQuery.isFetching ? "Loading your QnA…" : "Preparing your QnA…"}</p></main>;
  }
  const loadError = courseQuery.isError ? courseQuery.error : quiz.error;
  const unavailableStatus = loadError instanceof QuizLoadError ? loadError.status : undefined;
  const missingChapter = !courseQuery.isError && !chapter;
  const lockedChapter = chapter?.status === "locked" || unavailableStatus === 403;
  const unavailable = missingChapter || lockedChapter || unavailableStatus === 404;
  if (courseQuery.isError || quiz.isError || unavailable || !question) {
    const pending = unavailableStatus === 202;
    const message = lockedChapter ? "This chapter is locked. Complete the earlier chapters before taking its QnA."
      : unavailable ? "This chapter is unavailable. Return to the course to choose a chapter."
      : pending ? "Your QnA is still being prepared. Try again in a moment, or return to the chapter while you wait."
      : loadError instanceof QuizLoadError && loadError.generationFailed ? loadError.message
      : "Could not load this QnA. Try again, or return to the chapter.";
    return <main id="main-content" tabIndex={-1} className="reading-shell">
      <h1 className="display mt-16 text-4xl leading-none">{unavailable ? "QnA unavailable" : pending ? "QnA still preparing" : "Could not load QnA"}</h1>
      <p role={pending ? "status" : "alert"} className="ui mt-5 text-sm text-[var(--muted)]">{message}</p>
      {recovery.isError ? <p role="alert" className="ui mt-4 text-sm text-[var(--accent-dark)]">{recovery.error.message}</p> : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {!unavailable ? <button type="button" className="button-primary ui" onClick={() => recovery.mutate()}>Try again</button> : null}
      </div>
    </main>;
  }
  if (result) { const missedConcepts = [...new Set(result.answers.flatMap((answer) => answer.missedConcept?.trim() ? [answer.missedConcept.trim()] : []))]; const hasNextChapter = !result.complete && result.nextChapterIdx != null; const nextHref = hasNextChapter ? `/course/${params.id}/ch/${result.nextChapterIdx}` : `/course/${params.id}`; return <main id="main-content" tabIndex={-1} className={`page-shell assessment-text ${styles.results}`}><div className={styles.content}><section className={styles.summary}><p className={styles.meta}>Chapter {Number(params.idx) + 1} assessment</p><div className={styles.titleRow}><h1 ref={resultRef} tabIndex={-1} className={`display ${styles.title}`}>{result.passed ? "Chapter complete" : "Keep going"}</h1><p className={styles.score}><span>{Math.round(result.score * 100)}%</span> score</p></div><p className="assessment-body mt-3 text-[var(--muted)]">{result.passed ? "You passed this assessment. Durable mastery needs evidence from later recall and unfamiliar problems." : "Review the feedback, then try a fresh QnA."}</p></section>
    {missedConcepts.length > 0 ? <section aria-labelledby="missed-concepts-heading" className="mt-8">
      <h2 id="missed-concepts-heading" className="display text-2xl">Concepts to revisit</h2>
      <p className="assessment-body mt-2 text-[var(--muted)]">{result.passed ? "Your score passes, but this attempt still shows gaps. Review these concepts in the chapter:" : "This attempt shows gaps in these concepts:"}</p>
      <ul className="assessment-body mt-3 list-disc space-y-1 pl-6">{missedConcepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>
    </section> : null}
    {!result.passed && result.remediation ? <section aria-labelledby="remediation-heading" className="mt-6">
      <h2 id="remediation-heading" className="display text-2xl">Before trying again</h2>
      <p className="assessment-body mt-2 whitespace-pre-line text-[var(--muted)]">{result.remediation}</p>
    </section> : null}
    <div className={styles.answers}>{result.answers.map((answer, index) => <div className={`${styles.answer} ${answer.score >= 0.8 ? "answer-review--correct" : "answer-review--incorrect"}`} key={`${answer.prompt}-${index}`}>
      <h2 className={styles.question}>{index + 1}. {answer.prompt}</h2>
      <p className="assessment-body answer-response whitespace-pre-wrap" aria-label={answer.score >= 0.8 ? "Correct answer" : "Incorrect answer"}><span className="font-semibold">Your answer: </span>{answer.response}</p>
      <p className={`assessment-body whitespace-pre-wrap ${answer.score >= 0.8 ? "answer-feedback" : "answer-explanation"}`}><span className="font-semibold">{answer.score >= 0.8 ? "Feedback: " : "Explanation: "}</span>{answer.feedback}</p>
      <p className="assessment-body whitespace-pre-wrap"><span className="font-semibold">Model answer: </span>{answer.modelAnswer}</p>
    </div>)}</div><div className={styles.actions}><Link href={result.passed ? nextHref : `/course/${params.id}/ch/${params.idx}/quiz`} onClick={() => { if (!result.passed) { setResult(null); setResponses({}); setCurrentIndex(0); if (reviewed) void queryClient.resetQueries({ queryKey: ["quiz-v2", params.id, params.idx] }); else void queryClient.invalidateQueries({ queryKey: ["quiz-v2", params.id, params.idx] }); } }} className="button-primary ui">{result.passed ? result.complete ? "View completed course" : hasNextChapter ? "Continue" : "View course" : "Try again"}</Link><Link href={`/course/${params.id}/ch/${params.idx}`} className={styles.reviewLink}>Review chapter</Link></div></div></main>; }
  return <main id="main-content" tabIndex={-1} className="reading-shell"><header className="quiz-header"><div className="flex items-center justify-end gap-4"><span className="ui text-xs text-[var(--muted)]">{currentIndex + 1} / {questions.length}</span></div><div className="mt-4 h-1 bg-[var(--line)]"><progress className="progress-fill" value={currentIndex + 1} max={questions.length} aria-label="Quiz progress" /></div></header><h1 id={promptId} ref={promptRef} tabIndex={-1} className="display assessment-text assessment-prompt mt-16">{question.prompt}</h1><div className="mt-10"><div role="radiogroup" aria-labelledby={promptId} className="space-y-3">{question.options.map((option, index) => <label className="assessment-option flex cursor-pointer items-start gap-3 border border-[var(--line)] px-4 py-4 transition-colors hover:border-[var(--accent)]" key={option}><input type="radio" disabled={isSubmitting} name={question.id} checked={responses[question.id] === option} onChange={() => { setResponses({ ...responses, [question.id]: option }); setError(""); }} /><span className="assessment-text min-w-0 flex-1">{String.fromCharCode(65 + index)}. {option}</span></label>)}</div></div>{stale ? <button className="button-secondary mt-4" type="button" onClick={() => { setResponses({}); setCurrentIndex(0); setStale(false); setError(""); void quiz.refetch(); }}>Reload quiz</button> : null}{error ? <p ref={errorRef} tabIndex={-1} className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}{isSubmitting ? <div className="ui mt-6 flex items-center gap-3 border border-[var(--line)] bg-[var(--paper-deep)] px-4 py-3 text-sm text-[var(--muted)]" role="status" aria-live="polite"><span className="status-pulse" aria-hidden="true" />{gradingMessages[gradingStage]}</div> : null}<div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" disabled={isSubmitting || currentIndex === 0} onClick={() => { navigateQuestion(currentIndex - 1); }} className="button-secondary ui sm:flex-1">Previous question</button><button type="button" disabled={isSubmitting} onClick={() => { if (currentIndex + 1 < questions.length) { navigateQuestion(currentIndex + 1); } else { void submit(); } }} className="button-primary ui sm:flex-1">{isSubmitting ? "Grading your answers…" : currentIndex + 1 < questions.length ? "Next question" : "Submit answers"}</button></div></main>;
}
