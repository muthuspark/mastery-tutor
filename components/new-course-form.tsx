"use client";

import { FormEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type Agent = "codex" | "claude";

const generationStages = [
  { title: "Saving your request", detail: "Creating your saved course" },
];

export function NewCourseForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  const [agentDiscoveryFailed, setAgentDiscoveryFailed] = useState(false);
  const discoveringAgents = useRef(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | "">("");
  const generationStage = 0;
  const topicRef = useRef<HTMLTextAreaElement>(null);

  const discoverAgents = useCallback(() => {
    if (discoveringAgents.current) return;
    discoveringAgents.current = true;
    fetch("/api/agents")
      .then((response) => { if (!response.ok) throw new Error("Could not load agents"); return response.json(); })
      .then((body: { available?: Agent[]; selected?: Agent | null }) => {
        setAvailableAgents(body.available ?? []);
        setAgent(body.selected ?? body.available?.[0] ?? "");
        setAgentDiscoveryFailed(false);
      })
      .catch(() => setAgentDiscoveryFailed(true))
      .finally(() => {
        discoveringAgents.current = false;
        setIsLoadingAgents(false);
      });
  }, []);

  useEffect(() => { void discoverAgents(); }, [discoverAgents]);

  function retryAgentDiscovery() {
    if (discoveringAgents.current) return;
    setIsLoadingAgents(true);
    void discoverAgents();
  }



  async function changeAgent(nextAgent: Agent) {
    setAgent(nextAgent);
    await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent: nextAgent }) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || isLoadingAgents || agentDiscoveryFailed || availableAgents.length === 0) return;
    setIsSubmitting(true); setError("");
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
      {isSubmitting ? <GenerationOverlay stage={generationStage} agent={agent || availableAgents[0]} returnFocusRef={topicRef} /> : null}
      <form className="new-course-form" onSubmit={submit}>
        <label className="sr-only" htmlFor="topic">I want to learn</label>
        <textarea ref={topicRef} id="topic" name="topic" required rows={4} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="the fundamentals of system design" className="field" disabled={isSubmitting} />
        <div className="course-form-actions">
          <div className="agent-control">
            {isLoadingAgents ? <p className="ui text-sm text-[var(--muted)]" role="status">Finding learning agents…</p> : agentDiscoveryFailed ? (
              <p className="ui text-sm text-[var(--accent-dark)]" role="alert">Could not check for learning agents. Try again.</p>
            ) : availableAgents.length > 1 ? (
              <label className="ui block text-sm text-[var(--muted)]" htmlFor="agent">
                Learning agent
                <select id="agent" value={agent} disabled={isSubmitting} onChange={(event) => void changeAgent(event.target.value as Agent)} className="field agent-select mt-1.5">
                  <option value="codex">Codex CLI</option>
                  <option value="claude">Claude CLI</option>
                </select>
              </label>
            ) : availableAgents.length === 1 ? <p className="ui pb-3 text-sm text-[var(--muted)]">Using {availableAgents[0] === "codex" ? "Codex" : "Claude"} CLI</p> : <p className="ui text-sm text-[var(--accent-dark)]" role="alert">Install the Codex or Claude CLI to begin.</p>}
            {agentDiscoveryFailed ? <button type="button" className="button-secondary mt-3" disabled={isLoadingAgents} onClick={retryAgentDiscovery}>{isLoadingAgents ? "Checking agents…" : "Retry agent discovery"}</button> : null}
          </div>
          <button type="submit" disabled={isSubmitting || isLoadingAgents || agentDiscoveryFailed || availableAgents.length === 0} className="button-primary course-begin">{isSubmitting ? "Building your path…" : "Begin"}</button>
        </div>
        {error ? <p className="ui mt-4 text-sm text-[var(--accent-dark)]" role="alert">{error}</p> : null}
      </form>
    </>
  );
}

function GenerationOverlay({ stage, agent, returnFocusRef }: { stage: number; agent?: Agent; returnFocusRef: RefObject<HTMLTextAreaElement | null> }) {
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
        <span className="site-brand eyebrow">Mastery Tutor</span>
        <span className="site-header-status ui text-sm text-[var(--muted)]">{agent === "claude" ? "Claude CLI" : "Codex CLI"}</span>
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
