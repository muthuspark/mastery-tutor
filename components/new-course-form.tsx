"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function NewCourseForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setError("");
    const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error?.message ?? "Could not create the course."); setIsSubmitting(false); return; }
    router.push(`/course/${body.courseId}`);
  }

  return (
    <form className="border-t border-[var(--line)] pt-5" onSubmit={submit}>
      <label className="ui mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]" htmlFor="topic">I want to learn</label>
      <textarea id="topic" name="topic" required rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="the fundamentals of system design" className="field" />
      {error ? <p className="ui mt-3 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="button-primary ui mt-4 w-full">{isSubmitting ? "Building your path…" : "Begin"}</button>
      <p className="ui mt-3 text-center text-xs text-[var(--muted)]">No level or setup choices. Just begin.</p>
    </form>
  );
}
