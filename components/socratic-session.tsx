"use client";

import { useMutation } from "@tanstack/react-query";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { SocraticRequest, SocraticSessionView } from "@/lib/socratic-contracts";

class PracticeError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function SocraticSession({ chapterId, version }: { chapterId: string; version: number }) {
  const [session, setSession] = useState<SocraticSessionView | null>(null);
  const headingId = useId();
  const focusRef = useRef<HTMLHeadingElement>(null);
  const inFlight = useRef(false);
  const startAttempted = useRef(false);
  const practice = useMutation({
    mutationFn: async (input: SocraticRequest): Promise<SocraticSessionView> => {
      const response = await fetch(`/api/chapters/${chapterId}/socratic`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const body = await response.json();
      if (!response.ok) throw new PracticeError(body?.error?.message ?? "Could not prepare your next question. Try again.", response.status);
      return body;
    },
    retry: false,
    onSuccess: (next) => setSession(next),
    onSettled: () => { inFlight.current = false; },
  });
  const send = useCallback((input: SocraticRequest) => {
    if (inFlight.current) return;
    inFlight.current = true;
    practice.mutate(input);
  }, [practice.mutate]);
  useEffect(() => {
    if (startAttempted.current) return;
    startAttempted.current = true;
    send({ action: "start", version });
  }, [send, version]);
  useEffect(() => {
    if (session) focusRef.current?.focus();
  }, [session]);
  const lastTurn = session?.turns.at(-1);
  const conflict = practice.error instanceof PracticeError && practice.error.status === 409;
  const pendingMessage = practice.variables?.action === "answer" ? "Following your reasoning and preparing the next step…" : "Preparing your first question…";
  return <section aria-label="Chapter practice" className="socratic-session">
    {session?.question ? <>
      {lastTurn ? <div className="socratic-feedback" aria-live="polite">
        <p className="ui text-sm font-semibold">{lastTurn.correct ? "Building on your thinking" : "Let’s examine that"}</p>
        <p id={`${headingId}-feedback`} className="assessment-body mt-2 whitespace-pre-wrap">{lastTurn.feedback}</p>
      </div> : null}
      {session.question.setup ? <p id={`${headingId}-setup`} className="assessment-body mt-6 whitespace-pre-wrap">{session.question.setup}</p> : null}
      <h3 id={`${headingId}-question`} ref={focusRef} tabIndex={-1} aria-describedby={[lastTurn ? `${headingId}-feedback` : null, session.question.setup ? `${headingId}-setup` : null].filter(Boolean).join(" ") || undefined} className="display assessment-text mt-6 text-2xl">{session.question.prompt}</h3>
      <QuestionChoices key={session.question.id} promptId={`${headingId}-question`} question={session.question} pending={practice.isPending} disabled={conflict} onAnswer={(choiceIndex, usedHint) => send({ action: "answer", version, sessionId: session.id, questionId: session.question!.id, choiceIndex, usedHint })} />
    </> : null}
    {session?.summary ? <div className="mt-8">
      <h3 ref={focusRef} tabIndex={-1} className="display text-2xl">Putting it together</h3>
      <p className="ui mt-2 text-sm text-[var(--muted)]">{session.turns.length} steps explored</p>
      <p className="assessment-body mt-4 whitespace-pre-wrap">{session.summary}</p>
      <p className="assessment-body mt-4 text-[var(--muted)]">Read the lesson below to connect these ideas, then take the chapter quiz when you’re ready.</p>
    </div> : null}
    {session && session.turns.length > 0 ? <details className="mt-6">
      <summary className="ui cursor-pointer py-2 text-sm">Review your reasoning so far</summary>
      <ol className="mt-3 space-y-5">{session.turns.map((turn, index) => <li key={index}>
        <p className="font-semibold">{index + 1}. {turn.prompt}</p>
        <p className="assessment-body mt-2">Your choice: {turn.response}</p>
        <p className="assessment-body mt-2 whitespace-pre-wrap">{turn.feedback}</p>
      </li>)}</ol>
    </details> : null}
    {practice.isPending ? <p role="status" className="loading-state ui mt-6 text-sm text-[var(--muted)]">{pendingMessage}</p> : null}
    {practice.isError ? <div className="mt-5">
      <p role="alert" className="ui text-sm">{practice.error instanceof PracticeError ? practice.error.message : "Could not reach the tutor. Your saved practice is still available. Try again."}</p>
      {!session && !conflict ? <button type="button" className="button-secondary ui mt-3" onClick={() => send({ action: "start", version })}>Try again</button> : null}
      {conflict ? <button type="button" className="text-button ui mt-3 text-sm" onClick={() => window.location.reload()}>Reload chapter</button> : null}
    </div> : null}
  </section>;
}

function QuestionChoices({ question, promptId, pending, disabled, onAnswer }: {
  question: NonNullable<SocraticSessionView["question"]>;
  promptId: string;
  pending: boolean;
  disabled: boolean;
  onAnswer: (choiceIndex: number | null, usedHint: boolean) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const [hintShown, setHintShown] = useState(false);
  const hintId = useId();
  return <form className="mt-6" onSubmit={(event) => {
    event.preventDefault();
    if (selected === null || pending || disabled) return;
    onAnswer(selected === -1 ? null : selected, hintShown);
  }}>
    <fieldset aria-labelledby={promptId} disabled={pending || disabled} className="socratic-choices">
      <legend className="sr-only">Choose your answer</legend>
      {[...question.options, "I'm not sure"].map((option, index) => {
        const value = index === question.options.length ? -1 : index;
        return <label key={index} className="assessment-option flex cursor-pointer items-start gap-3">
          <input type="radio" name={question.id} value={value} checked={selected === value} onChange={() => setSelected(value)} />
          <span className="assessment-text min-w-0 flex-1">{value === -1 ? option : `${String.fromCharCode(65 + index)}. ${option}`}</span>
        </label>;
      })}
    </fieldset>
    <div className="mt-5 flex flex-wrap items-center gap-4">
      <button type="submit" className="button-primary ui" disabled={selected === null || pending || disabled}>{pending ? "Thinking it through…" : "Continue"}</button>
      <button type="button" className="text-button ui text-sm" disabled={pending || disabled} aria-expanded={hintShown} aria-controls={hintId} onClick={() => setHintShown(true)}>Give me a hint</button>
    </div>
    {hintShown ? <p id={hintId} role="status" className="socratic-feedback assessment-body whitespace-pre-wrap"><span className="font-semibold">Hint: </span>{question.hint}</p> : null}
  </form>;
}
