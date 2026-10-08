"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Agent = "codex" | "claude";

export function NewCourseForm() {
  const router = useRouter();
  const [topic, setTopic] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availableAgents, setAvailableAgents] = useState<Agent[]>([]);
  const [agent, setAgent] = useState<Agent | "">("");

  useEffect(() => {
    fetch("/api/agents")
      .then((response) => response.json())
      .then((body: { available?: Agent[]; selected?: Agent | null }) => {
        setAvailableAgents(body.available ?? []);
        setAgent(body.selected ?? body.available?.[0] ?? "");
      })
      .catch(() => setAvailableAgents([]));
  }, []);

  async function changeAgent(nextAgent: Agent) {
    setAgent(nextAgent);
    await fetch("/api/agents", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent: nextAgent }) });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setIsSubmitting(true); setError("");
    const response = await fetch("/api/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ topic, ...(agent ? { agent } : {}) }) });
    const body = await response.json().catch(() => null);
    if (!response.ok) { setError(body?.error?.message ?? "Could not create the course."); setIsSubmitting(false); return; }
    router.push(`/course/${body.courseId}`);
  }

  return (
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
  );
}
