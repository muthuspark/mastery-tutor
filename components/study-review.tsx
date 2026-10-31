"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { studyRequest, StudyRequestError } from "@/lib/study-client";
import type {
  ReviewPublic,
  ReviewResult,
  TodayStudy,
} from "@/lib/study-contracts";
export function StudyReview({ id }: { id: string }) {
  const client = useQueryClient(),
    router = useRouter(),
    heading = useRef<HTMLHeadingElement>(null),
    alert = useRef<HTMLParagraphElement>(null);
  const [responses, setResponses] = useState<Record<string, number>>({}),
    [error, setError] = useState("");
  const query = useQuery<ReviewPublic>({
    queryKey: ["study", "review", id],
    queryFn: () => studyRequest(`/api/study/reviews/${id}`),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const submit = useMutation({
    mutationFn: () =>
      studyRequest<ReviewResult>(`/api/study/reviews/${id}/submit`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          answers: query.data!.questions.map((q) => ({
            questionId: q.id,
            selectedOptionIndex: responses[q.id],
          })),
        }),
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["study", "today"] });
      void client.invalidateQueries({ queryKey: ["courses"] });
    },
  });
  const restart = useMutation({
    mutationFn: () =>
      studyRequest<ReviewPublic>("/api/study/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ restart: true }),
      }),
    onSuccess: (review) => {
      setResponses({});
      setError("");
      router.replace(`/study/review/${review.id}`);
    },
  });
  const result = submit.data ?? query.data?.result;
  const next = useQuery<TodayStudy>({
    queryKey: ["study", "today"],
    queryFn: () => studyRequest("/api/study/today"),
    enabled: Boolean(result),
    retry: false,
  });
  useEffect(() => {
    if (result) heading.current?.focus();
  }, [result]);
  useEffect(() => {
    if (error || submit.isError) alert.current?.focus();
  }, [error, submit.isError]);
  function send() {
    const missing = query.data!.questions.findIndex(
      (q) => responses[q.id] === undefined,
    );
    if (missing !== -1) {
      setError(
        `Answer question ${missing + 1} before submitting. Your other answers are saved.`,
      );
      return;
    }
    setError("");
    submit.mutate();
  }
  if (query.isPending)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="reading-shell study-review"
      >
        <h1>Review</h1>
        <p role="status">Loading your review…</p>
      </main>
    );
  if (query.isError)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="reading-shell study-review"
      >
        <h1>Review unavailable</h1>
        <p role="alert">{query.error.message}</p>
        <div className="review-actions">
          {query.error instanceof StudyRequestError &&
          query.error.status === 409 ? (
            <button
              className="button-primary"
              disabled={restart.isPending}
              onClick={() => restart.mutate()}
            >
              Refresh review
            </button>
          ) : (
            <button
              className="button-secondary"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          )}
          <Link href="/" className="button-secondary">
            View today’s study
          </Link>
        </div>
        {restart.isError ? <p role="alert">{restart.error.message}</p> : null}
      </main>
    );
  if (result)
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="reading-shell study-review"
      >
        <h1 ref={heading} tabIndex={-1}>
          Review complete
        </h1>
        <p role="status">
          Your review is saved. Course completion stays the same.
        </p>
        <div className="review-results">
          {result.answers.map((answer) => (
            <section key={answer.id}>
              <h2>{answer.concept}</h2>
              <p>{answer.prompt}</p>
              <p>
                <strong>Your answer:</strong> {answer.response}
              </p>
              <p className="review-feedback">{answer.feedback}</p>
              <p>
                <strong>Next review:</strong> {answer.dueDate}
              </p>
            </section>
          ))}
        </div>
        <div className="review-actions">
          <Link className="button-primary" href="/">
            View today’s study
          </Link>
          {next.data?.nextLesson ? (
            <Link className="button-secondary" href={next.data.nextLesson.href}>
              Continue lesson
            </Link>
          ) : null}
        </div>
      </main>
    );
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="reading-shell study-review"
    >
      <h1>Review earlier ideas</h1>
      <p>
        Answer all {query.data.questions.length} questions. These questions may
        repeat. Reviewing keeps your course progress intact.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          send();
        }}
      >
        {query.data.questions.map((question, index) => (
          <fieldset
            disabled={submit.isPending || restart.isPending}
            key={question.id}
          >
            <legend>
              {index + 1}. {question.prompt}
            </legend>
            <p className="review-reason">
              {question.course} · {question.concept}. {question.reason}
            </p>
            {question.options.map((option, i) => (
              <label className="review-option" key={i}>
                <input
                  type="radio"
                  name={question.id}
                  checked={responses[question.id] === i}
                  onChange={() => {
                    setResponses({ ...responses, [question.id]: i });
                    setError("");
                  }}
                />
                <span>{option}</span>
              </label>
            ))}
          </fieldset>
        ))}
        {error || submit.isError ? (
          <p ref={alert} tabIndex={-1} role="alert">
            {error || submit.error?.message}
          </p>
        ) : null}
        <div className="review-actions">
          <button
            className="button-primary"
            disabled={submit.isPending || restart.isPending}
          >
            {submit.isPending ? "Saving review…" : "Submit review"}
          </button>
          {submit.error instanceof StudyRequestError &&
          submit.error.status === 409 ? (
            <button
              type="button"
              className="button-secondary"
              disabled={restart.isPending}
              onClick={() => restart.mutate()}
            >
              Refresh review
            </button>
          ) : null}
          <Link href="/" className="button-secondary">
            Leave review
          </Link>
        </div>
        <p className="review-reason">
          Leaving without submitting does not record answers. You can resume
          this batch later.
        </p>
        {restart.isError ? <p role="alert">{restart.error.message}</p> : null}
      </form>
    </main>
  );
}
