"use client";

import { useMutation } from "@tanstack/react-query";

export type PreparationState = {
  preparationStatus?: "pending" | "generating" | "ready" | "failed";
  preparationStage?: "planning" | "reviewing" | "repairing" | null;
  preparationError?: string | null;
};

export function CoursePreparation({ courseId, course, onRefresh }: { courseId: string; course: PreparationState; onRefresh: () => Promise<unknown> }) {
  const retry = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/courses/${courseId}/retry`, { method: "POST" });
      if (!response.ok) throw new Error("Could not restart course preparation. Try again.");
      await onRefresh();
    },
    retry: false,
  });
  const failed = course.preparationStatus === "failed";
  const message = course.preparationStage === "reviewing" ? "Checking coverage and chapter order."
    : course.preparationStage === "repairing" ? "Refining the learning path after review."
    : "Building a focused path for your learning request.";
  return <main id="main-content" tabIndex={-1} className="page-shell">
    <section className="max-w-2xl py-8" aria-labelledby="preparation-heading">
      <p className="eyebrow">Your learning path</p>
      <h1 id="preparation-heading" className="display mt-4 text-4xl leading-tight">{failed ? "Could not prepare your course" : "Preparing your course"}</h1>
      <p role={failed && !retry.isPending ? "alert" : "status"} aria-live="polite" className="mt-5 text-lg text-[var(--muted)]">{retry.isPending ? "Restarting preparation…" : failed ? course.preparationError ?? "Preparation did not finish. Try again." : message}</p>
      {!failed ? <p className="ui mt-4 text-sm text-[var(--muted)]">You can leave this page and return to your saved course while preparation continues.</p> : null}
      {retry.isError ? <p role="alert" className="ui mt-4 text-sm text-[var(--accent-dark)]">{retry.error.message}</p> : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {failed ? <button type="button" className="button-primary ui" disabled={retry.isPending} onClick={() => retry.mutate()}>{retry.isPending ? "Trying again…" : "Try again"}</button> : null}
      </div>
    </section>
  </main>;
}
