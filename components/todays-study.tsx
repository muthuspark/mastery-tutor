"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { TodayStudy, ReviewPublic } from "@/lib/study-contracts";
import { studyRequest } from "@/lib/study-client";
export function TodaysStudy() {
  const client = useQueryClient(),
    router = useRouter();
  const query = useQuery<TodayStudy>({
    queryKey: ["study", "today"],
    queryFn: () => studyRequest("/api/study/today"),
    retry: false,
  });
  const data = query.data;
  const { refetch } = query;
  useEffect(() => {
    if (!data) return;
    const refresh = () => {
      void refetch();
    };
    const visible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const delay = Math.max(
      1000,
      Math.min(2147483647, Date.parse(data.nextRollover) - Date.now() + 500),
    );
    const timer = window.setTimeout(refresh, delay);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", refresh);
    };
  }, [data, refetch]);
  const start = useMutation({
    mutationFn: () =>
      studyRequest<ReviewPublic>("/api/study/reviews", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }),
    onSuccess: (review) => {
      void client.invalidateQueries({ queryKey: ["study"] });
      router.push(`/study/review/${review.id}`);
    },
  });
  if (!data)
    return (
      <section
        className="featured-study today-study"
        aria-label="Today’s study"
      >
        <h2>Today’s study</h2>
        {query.isError ? (
          <p role="alert">
            Could not load today’s study.{" "}
            <button
              className="text-button"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </p>
        ) : (
          <p role="status">Loading today’s study…</p>
        )}
      </section>
    );
  return (
    <section
      className="featured-study today-study"
      aria-labelledby="today-study-title"
    >
      <header className="today-study-heading">
        <h2 id="today-study-title">Today’s study</h2>
        <p>
          {data.today} · {data.timeZone}
        </p>
      </header>
      {data.setupRequired ? (
        <>
          <p>
            Choose your review time zone to bring earlier ideas back into your
            study.
          </p>
          <ReviewTimeZone
            initialZone={
              Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
            }
          />
        </>
      ) : (
        <>
          {data.items.length ? (
            <>
              <p>
                {data.dueCount}{" "}
                {data.dueCount === 1 ? "concept is" : "concepts are"} due. This
                batch includes up to five.
              </p>
              <ol className="today-study-list">
                {data.items.map((item) => (
                  <li key={item.id}>
                    <div>
                      <strong>{item.concept}</strong>
                      <p>
                        {item.course} · {item.chapter}
                      </p>
                    </div>
                    <p>{item.reason}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p>
              {data.nextDueDate
                ? `Nothing is due today. Your next review is scheduled for ${data.nextDueDate}.`
                : "No reviews are due. Study a lesson to add concepts to your review schedule."}
            </p>
          )}
          {data.unavailableCount > 0 ? (
            <p>
              {data.unavailableCount}{" "}
              {data.unavailableCount === 1 ? "concept needs" : "concepts need"}{" "}
              current questions before review.{" "}
              <Link href="#saved-studies">Open a saved study</Link> to revisit
              the source.
            </p>
          ) : null}
          <div className="today-study-actions">
            {data.dueCount > 0 ? (
              <button
                className="button-primary"
                disabled={start.isPending}
                onClick={() => start.mutate()}
              >
                {start.isPending
                  ? "Preparing review…"
                  : data.openReviewId
                    ? "Resume review"
                    : "Start review"}
              </button>
            ) : null}
            {data.openReviewId && !data.dueCount ? (
              <Link
                className="button-secondary"
                href={`/study/review/${data.openReviewId}`}
              >
                Resume review
              </Link>
            ) : null}
            {data.nextLesson ? (
              <Link
                className={
                  data.dueCount > 0 ? "button-secondary" : "button-primary"
                }
                href={data.nextLesson.href}
              >
                Continue lesson
              </Link>
            ) : null}
          </div>
          {data.nextLesson ? (
            <p>
              <strong>{data.nextLesson.title}</strong> ·{" "}
              {data.nextLesson.reason}
            </p>
          ) : null}
          <details>
            <summary>Review time zone: {data.timeZone}</summary>
            <ReviewTimeZone key={data.timeZone} initialZone={data.timeZone} />
          </details>
          <p className="today-study-note">
            Reviews follow a 1, 3, 7, 14, then 30-day schedule. These dates are
            scheduling rules, not estimates of forgetting. Questions may repeat.
          </p>
        </>
      )}
      {start.isError ? <p role="alert">{start.error.message}</p> : null}
      {query.isError && data ? (
        <p role="alert">
          Could not refresh your recommendations.{" "}
          <button className="text-button" onClick={() => void query.refetch()}>
            Try again
          </button>
        </p>
      ) : null}
    </section>
  );
}
function ReviewTimeZone({ initialZone }: { initialZone: string }) {
  const [zone, setZone] = useState(initialZone),
    client = useQueryClient();
  const save = useMutation({
    mutationFn: () =>
      studyRequest("/api/study/preferences", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ timeZone: zone }),
      }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["study"] }),
  });
  return (
    <form
      className="study-zone-form"
      onSubmit={(event) => {
        event.preventDefault();
        save.mutate();
      }}
    >
      <label>
        Review time zone
        <input
          className="field"
          value={zone}
          onChange={(event) => setZone(event.target.value)}
          required
          maxLength={100}
          autoComplete="off"
        />
      </label>
      <p>
        Use a time zone such as Asia/Kolkata or UTC. Due dates stay the same
        when you change it.
      </p>
      <button className="button-secondary" disabled={save.isPending}>
        {save.isPending ? "Saving…" : "Save review time zone"}
      </button>
      {save.isError ? (
        <p role="alert">{save.error.message}</p>
      ) : save.isSuccess ? (
        <p role="status">Review time zone saved.</p>
      ) : null}
    </form>
  );
}
