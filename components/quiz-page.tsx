"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";

type Question = { id: string; type: "mcq"; prompt: string; options: string[]; isReview: boolean };
type QuizResponse = { questions: Question[] };
type CourseChapter = { id: string; idx: number; status: "locked" | "open" | "passed" };
type CourseResponse = { chapters: CourseChapter[] };
type Result = { remediation?: string | null; score: number; passed: boolean; complete?: boolean; nextChapterIdx?: number | null; answers: { prompt: string; response: string; score: number; feedback: string; modelAnswer: string; missedConcept: string | null }[] };

class QuizLoadError extends Error {
  constructor(readonly status: number) {
    super(status === 202 ? "generation_pending" : "Could not load this QnA");
  }
}

async function fetchReadyJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (response.status === 202 || !response.ok) throw new QuizLoadError(response.status);
  return response.json();
}

export function QuizPage() {
  const params = useParams<{ id: string; idx: string }>(); const queryClient = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0); const [responses, setResponses] = useState<Record<string, string>>({}); const [result, setResult] = useState<Result | null>(null); const [error, setError] = useState(""); const [isSubmitting, setIsSubmitting] = useState(false); const [gradingStage, setGradingStage] = useState(0);
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
  const quiz = useQuery<QuizResponse>({ queryKey: ["quiz-v2", params.id, params.idx], enabled: Boolean(chapter?.id) && chapter?.status !== "locked", queryFn: () => fetchReadyJson(`/api/chapters/${chapter?.id}/quiz`), retry: (count, error) => error.message === "generation_pending" && count < 4 });
  useEffect(() => {
    if (!quiz.data || !chapter || !courseQuery.data) return;
    const next = courseQuery.data.chapters.find((item) => item.idx > chapter.idx && item.status === "open");
    if (next) {
      void queryClient.prefetchQuery({
        queryKey: ["chapter", next.id],
        queryFn: () => fetchReadyJson(`/api/chapters/${next.id}`),
        retry: (count, error) => error.message === "generation_pending" && count < 4,
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
      const response = await fetch(`/api/chapters/${chapter.id}/attempts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ answers: questions.map((item) => ({ questionId: item.id, response: responses[item.id] })) }) });
      const body = await response.json();
      if (!response.ok) { setError(body?.error?.message ?? "Could not submit the QnA."); return; }
      setResult(body);
    } catch { setError("Could not reach the tutor. Check the server and try again."); }
    finally { setIsSubmitting(false); }
  }
  if (courseQuery.isLoading || quiz.isLoading || (courseQuery.isError && courseQuery.isFetching) || (quiz.isError && quiz.isFetching)) {
    return <main className="reading-shell ui text-sm text-[var(--muted)]"><p role="status">{courseQuery.isFetching ? "Loading your QnA…" : "Preparing your QnA…"}</p></main>;
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
      : "Could not load this QnA. Try again, or return to the chapter.";
    return <main className="reading-shell">
      <h1 className="display mt-16 text-4xl leading-none">{unavailable ? "QnA unavailable" : pending ? "QnA still preparing" : "Could not load QnA"}</h1>
      <p role={pending ? "status" : "alert"} className="ui mt-5 text-sm text-[var(--muted)]">{message}</p>
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {!unavailable ? <button type="button" className="button-primary ui" onClick={() => { void (courseQuery.isError ? courseQuery.refetch() : quiz.refetch()); }}>Try again</button> : null}
        <Link prefetch={false} href={unavailable ? `/course/${params.id}` : `/course/${params.id}/ch/${params.idx}`} className="button-secondary ui">{unavailable ? "Back to course" : "Back to chapter"}</Link>
      </div>
    </main>;
  }
  if (result) { const missedConcepts = [...new Set(result.answers.flatMap((answer) => answer.missedConcept?.trim() ? [answer.missedConcept.trim()] : []))]; const hasNextChapter = !result.complete && result.nextChapterIdx != null; const nextHref = hasNextChapter ? `/course/${params.id}/ch/${result.nextChapterIdx}` : `/course/${params.id}`; return <main className="reading-shell assessment-text"><Link href={`/course/${params.id}`} className="eyebrow underline-offset-4">← Back to course</Link><h1 ref={resultRef} tabIndex={-1} className="display assessment-heading mt-16">{result.passed ? "Chapter complete" : "Keep going"}</h1><p className="display assessment-heading mt-5 text-[var(--accent)]">{Math.round(result.score * 100)}%</p><p className="assessment-body mt-3 text-[var(--muted)]">{result.passed ? "You passed this assessment. Durable mastery needs evidence from later recall and unfamiliar problems." : "Review the feedback, then try a fresh QnA."}</p>
    {missedConcepts.length > 0 ? <section aria-labelledby="missed-concepts-heading" className="mt-8">
      <h2 id="missed-concepts-heading" className="display text-2xl">Concepts to revisit</h2>
      <p className="assessment-body mt-2 text-[var(--muted)]">{result.passed ? "Your score passes, but this attempt still shows gaps. Review these concepts in the chapter:" : "This attempt shows gaps in these concepts:"}</p>
      <ul className="assessment-body mt-3 list-disc space-y-1 pl-6">{missedConcepts.map((concept) => <li key={concept}>{concept}</li>)}</ul>
    </section> : null}
    {!result.passed && result.remediation ? <section aria-labelledby="remediation-heading" className="mt-6">
      <h2 id="remediation-heading" className="display text-2xl">Before trying again</h2>
      <p className="assessment-body mt-2 whitespace-pre-line text-[var(--muted)]">{result.remediation}</p>
    </section> : null}
    <div className="mt-10 divide-y divide-[var(--line)] border-y border-[var(--line)]">{result.answers.map((answer, index) => <div className="space-y-4 py-6" key={`${answer.prompt}-${index}`}>
      <h2 className="text-xl font-semibold leading-snug">{index + 1}. {answer.prompt}</h2>
      <p className="assessment-body whitespace-pre-wrap"><span className="font-semibold">Your answer: </span>{answer.response}</p>
      <p className={`assessment-body whitespace-pre-wrap ${answer.score >= 0.8 ? "text-[var(--success)]" : "text-[var(--accent-dark)]"}`}><span className="font-semibold">Feedback: </span>{answer.feedback}</p>
      <p className="assessment-body whitespace-pre-wrap"><span className="font-semibold">Model answer: </span>{answer.modelAnswer}</p>
    </div>)}</div><Link href={result.passed ? nextHref : `/course/${params.id}/ch/${params.idx}/quiz`} onClick={() => { if (!result.passed) { setResult(null); setResponses({}); setCurrentIndex(0); queryClient.invalidateQueries({ queryKey: ["quiz-v2", params.id, params.idx] }); } }} className="button-primary ui mt-10 w-full">{result.passed ? result.complete ? "View completed course" : hasNextChapter ? "Continue" : "Back to course" : "Try again"}</Link><Link href={`/course/${params.id}/ch/${params.idx}`} className="ui mt-4 block text-center text-xs text-[var(--muted)] hover:text-[var(--ink)]">Review chapter</Link></main>; }
  return <main className="reading-shell"><header className="pb-5"><div className="flex items-center justify-between gap-4"><Link href={`/course/${params.id}/ch/${params.idx}`} aria-disabled={isSubmitting} tabIndex={isSubmitting ? -1 : undefined} onClick={(event) => { if (isSubmitting) event.preventDefault(); }} className="eyebrow inline-flex items-center gap-2 no-underline hover:text-[var(--accent-dark)]"><svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg><span>Back to chapter</span></Link><span className="ui text-xs text-[var(--muted)]">{currentIndex + 1} / {questions.length}</span></div><div className="mt-4 h-1 bg-[var(--line)]"><div className="h-1 bg-[var(--accent)]" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} /></div></header><h1 id={promptId} ref={promptRef} tabIndex={-1} className="display assessment-text assessment-prompt mt-16">{question.prompt}</h1><div className="mt-10"><div role="radiogroup" aria-labelledby={promptId} className="space-y-3">{question.options.map((option, index) => <label className="assessment-option flex cursor-pointer items-start gap-3 border border-[var(--line)] px-4 py-4 transition-colors hover:border-[var(--accent)]" key={option}><input type="radio" disabled={isSubmitting} name={question.id} checked={responses[question.id] === option} onChange={() => { setResponses({ ...responses, [question.id]: option }); setError(""); }} /><span className="assessment-text min-w-0 flex-1">{String.fromCharCode(65 + index)}. {option}</span></label>)}</div></div>{error ? <p ref={errorRef} tabIndex={-1} className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}{isSubmitting ? <div className="ui mt-6 flex items-center gap-3 border border-[var(--line)] bg-[var(--paper-deep)] px-4 py-3 text-sm text-[var(--muted)]" role="status" aria-live="polite"><span className="status-pulse" aria-hidden="true" />{gradingMessages[gradingStage]}</div> : null}<div className="mt-8 flex flex-col gap-3 sm:flex-row"><button type="button" disabled={isSubmitting || currentIndex === 0} onClick={() => { navigateQuestion(currentIndex - 1); }} className="button-secondary ui sm:flex-1">Previous question</button><button type="button" disabled={isSubmitting} onClick={() => { if (currentIndex + 1 < questions.length) { navigateQuestion(currentIndex + 1); } else { void submit(); } }} className="button-primary ui sm:flex-1">{isSubmitting ? "Grading your answers…" : currentIndex + 1 < questions.length ? "Next question" : "Submit answers"}</button></div></main>;
}
