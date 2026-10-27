"use client";

import { FormEvent, RefObject, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const generationStages = [
  { title: "Saving your request", detail: "Creating your saved course" },
];

export function NewCourseForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const generationStage = 0;
  const topicRef = useRef<HTMLTextAreaElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    setIsSubmitting(true); setError("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setError(body?.error?.message ?? "Could not create the course."); setIsSubmitting(false); return; }
      router.push(`/course/${body.courseId}`);
    } catch {
      setError("Could not reach the tutor. Please try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {isSubmitting ? <GenerationOverlay stage={generationStage} returnFocusRef={topicRef} /> : null}
      <form className="new-course-form" onSubmit={submit}>
        <label className="course-topic-label" htmlFor="topic">What do you want to learn?</label>
        <textarea ref={topicRef} id="topic" name="topic" required rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="e.g. the fundamentals of system design" className="field" disabled={isSubmitting} aria-invalid={error ? true : undefined} aria-describedby={error ? "course-form-error" : undefined} />
        <div className="course-form-actions">
          <button type="submit" disabled={isSubmitting} className="button-secondary course-begin">{isSubmitting ? "Building your path…" : "Create study →"}</button>

        </div>
        {error ? <p id="course-form-error" className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}
      </form>
    </>
  );
}

function GenerationOverlay({ stage, returnFocusRef }: { stage: number; returnFocusRef: RefObject<HTMLTextAreaElement | null> }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    const returnFocusTarget = returnFocusRef.current;
    if (!dialog) return;
    dialog.showModal();
    titleRef.current?.focus();
    return () => {
      dialog.close();
      if (returnFocusTarget?.isConnected) returnFocusTarget.focus();
    };
  }, [returnFocusRef]);

  const current = generationStages[stage];
  return (
    <dialog ref={dialogRef} className="generation-overlay" aria-modal="true" aria-labelledby="generation-title" aria-describedby="generation-detail" onCancel={(event) => event.preventDefault()} onKeyDown={(event) => {
      // This pending dialog has no actions. Keep Tab in its readable content.
      if (event.key === "Tab") {
        event.preventDefault();
        titleRef.current?.focus();
      }
    }}>
      <header className="site-header">
        <span className="site-brand eyebrow">Newton</span>
        <span className="site-header-status ui text-sm text-[var(--muted)]">Your learning workspace</span>
      </header>
      <div className="generation-overlay__inner">

        <div className="generation-layout">
          <section>
            <p className="eyebrow">Your curriculum desk</p>
            <h1 ref={titleRef} tabIndex={-1} id="generation-title" className="display generation-title">Building your learning path</h1>
            <p id="generation-detail" role="status" aria-atomic="true" className="generation-detail">{current.detail}.</p>
            <div className="generation-progress" aria-hidden="true"><span style={{ width: `${((stage + 1) / generationStages.length) * 100}%` }} /></div>
            <p className="ui generation-time">Writing and review will continue on your course page.</p>
          </section>

          <div className="generation-desk" aria-hidden="true">
            <div className="generation-sheet generation-sheet--back" />
            <div className="generation-sheet generation-sheet--middle" />
            <div className="generation-sheet generation-sheet--front">
              <span className="generation-sheet__line generation-sheet__line--short" />
              <span className="generation-sheet__line" />
              <span className="generation-sheet__line" />
              <span className="generation-sheet__line generation-sheet__line--faint" />
            </div>
            <span className="generation-slip generation-slip--one">Core ideas</span>
            <span className="generation-slip generation-slip--two">Prerequisites</span>
            <span className="generation-slip generation-slip--three">First chapter</span>
          </div>
        </div>

        <ol className="generation-stages" aria-label="Course creation progress">
          {generationStages.map((item, index) => (
            <li className={`generation-stage ${index === stage ? "is-active" : ""} ${index < stage ? "is-complete" : ""}`} key={item.title}>
              <span className="generation-stage__mark" aria-hidden="true">{index < stage ? "✓" : index + 1}</span>
              <span><strong>{item.title}</strong><small>{item.detail}</small></span>
            </li>
          ))}
        </ol>
      </div>
    </dialog>
  );
}
