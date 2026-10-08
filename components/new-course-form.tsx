"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

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
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | "">("");
  const [generationStage, setGenerationStage] = useState(0);

  useEffect(() => {
    fetch("/api/agents")
      .then((response) => response.json())
      .then((body: { available?: Agent[]; selected?: Agent | null }) => {
        setAvailableAgents(body.available ?? []);
        setAgent(body.selected ?? body.available?.[0] ?? "");
      })
      .catch(() => setAvailableAgents([]));
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
      <form className="border-t border-[var(--line)] pt-5" onSubmit={submit}>
      <label className="ui mb-2 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]" htmlFor="topic">I want to learn</label>
      <textarea id="topic" name="topic" required rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="the fundamentals of system design" className="field" />
      {availableAgents.length > 1 ? <label className="ui mt-4 block text-xs font-bold uppercase tracking-[0.1em] text-[var(--muted)]" htmlFor="agent">Learning agent<select id="agent" value={agent} onChange={(event) => void changeAgent(event.target.value as Agent)} className="field mt-2"><option value="codex">Codex CLI</option><option value="claude">Claude CLI</option></select></label> : null}
      {availableAgents.length === 1 ? <p className="ui mt-4 text-xs text-[var(--muted)]">Using {availableAgents[0] === "codex" ? "Codex" : "Claude"} CLI</p> : null}
      {availableAgents.length === 0 ? <p className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">Install the Codex or Claude CLI to begin.</p> : null}
      {error ? <p className="ui mt-3 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}
      <button type="submit" disabled={isSubmitting} className="button-primary ui mt-4 w-full">{isSubmitting ? "Building your path…" : "Begin"}</button>
      <p className="ui mt-3 text-center text-xs text-[var(--muted)]">No level or setup choices. Just begin.</p>
      </form>
    </>
  );
}

function GenerationOverlay({ stage, agent }: { stage: number; agent?: Agent }) {
  const current = generationStages[stage];
  return (
    <div className="generation-overlay" role="dialog" aria-modal="true" aria-labelledby="generation-title" aria-describedby="generation-detail">
      <div className="generation-overlay__inner">
        <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
          <span className="eyebrow">Mastery Tutor</span>
          <span className="ui text-xs text-[var(--muted)]">{agent === "claude" ? "Claude CLI" : "Codex CLI"}</span>
        </header>

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
