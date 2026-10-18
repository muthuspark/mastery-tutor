"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { SiteHeader } from "@/components/site-header";

type Agent = "codex" | "claude";

const generationStages = [
  { title: "Finding the essential ideas", detail: "Reading the shape of your topic" },
  { title: "Ordering the path", detail: "Putting each idea where it can do the most work" },
  { title: "Shaping your chapters", detail: "Turning the sequence into something you can follow" },
  { title: "Preparing your first lesson", detail: "The path is almost ready" },
];

export function NewCourseForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | "">("");
  const [generationStage, setGenerationStage] = useState(0);

  useEffect(() => {
    fetch("/api/agents")
      .then((response) => { if (!response.ok) throw new Error("Could not load agents"); return response.json(); })
      .then((body: { available?: Agent[]; selected?: Agent | null }) => {
        setAvailableAgents(body.available ?? []);
        setAgent(body.selected ?? body.available?.[0] ?? "");
      })
      .catch(() => setAvailableAgents([]))
      .finally(() => setIsLoadingAgents(false));
  }, []);

  useEffect(() => {
    if (!isSubmitting) return;
    const timer = window.setInterval(() => {
      setGenerationStage((stage) => Math.min(stage + 1, generationStages.length - 1));
    }, 6500);
    return () => window.clearInterval(timer);
  }, [isSubmitting]);

  async function changeAgent(nextAgent: Agent) {
    setAgent(nextAgent);
    await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent: nextAgent }) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setGenerationStage(0); setError("");
    try {
      const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, ...(agent ? { agent } : {}) }) });
      const body = await response.json().catch(() => null);
      if (!response.ok) { setError(body?.error?.message ?? "Could not create the course."); setIsSubmitting(false); return; }
      router.push(`/course/${body.courseId}`);
    } catch {
      setError("Could not reach the tutor. Check the server and try again.");
      setIsSubmitting(false);
    }
  }

  return (
    <>
      {isSubmitting ? <GenerationOverlay stage={generationStage} agent={agent || availableAgents[0]} /> : null}
      <form className="new-course-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="topic">I want to learn</label>
        <textarea id="topic" name="topic" required rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="the fundamentals of system design" className="field" disabled={isSubmitting} />
        <div className="course-form-actions">
          <div className="agent-control">
            {isLoadingAgents ? <p className="ui text-sm text-[var(--muted)]" role="status">Finding learning agents…</p> : availableAgents.length > 1 ? (
              <label className="ui block text-sm text-[var(--muted)]" htmlFor="agent">
                Learning agent
                <select id="agent" value={agent} disabled={isSubmitting} onChange={(event) => void changeAgent(event.target.value as Agent)} className="field agent-select mt-1.5">
                  <option value="codex">Codex CLI</option>
                  <option value="claude">Claude CLI</option>
                </select>
              </label>
            ) : availableAgents.length === 1 ? <p className="ui pb-3 text-sm text-[var(--muted)]">Using {availableAgents[0] === "codex" ? "Codex" : "Claude"} CLI</p> : <p className="ui text-sm text-[var(--accent-dark)]" role="alert">Install the Codex or Claude CLI to begin.</p>}
          </div>
          <button type="submit" disabled={isSubmitting || isLoadingAgents || availableAgents.length === 0} className="button-primary course-begin">{isSubmitting ? "Building your path…" : "Begin"}</button>
        </div>
        {error ? <p className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}
      </form>
    </>
  );
}

function GenerationOverlay({ stage, agent }: { stage: number; agent?: Agent }) {
  const current = generationStages[stage];
  return (
    <div className="generation-overlay" role="dialog" aria-modal="true" aria-labelledby="generation-title" aria-describedby="generation-detail">
      <SiteHeader status={agent === "claude" ? "Claude CLI" : "Codex CLI"} />
      <div className="generation-overlay__inner">

        <div className="generation-layout">
          <section>
            <p className="eyebrow">Your curriculum desk</p>
            <h1 id="generation-title" className="display generation-title">Building your learning path</h1>
            <p id="generation-detail" className="generation-detail">{current.detail}.</p>
            <div className="generation-progress" aria-hidden="true"><span style={{ width: `${((stage + 1) / generationStages.length) * 100}%` }} /></div>
            <p className="ui generation-time">This usually takes about a minute.</p>
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
    </div>
  );
}
