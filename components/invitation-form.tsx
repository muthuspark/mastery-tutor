"use client";
import { FormEvent, useState } from "react";

export function InvitationForm() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not send this invitation. Please try again.");
      setMessage(`${body.email}: ${body.message}`); setEmail("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not send this invitation. Please try again."); }
    finally { setBusy(false); }
  }
  return <section className="invitation-section mt-12 border-t border-[var(--line)] pt-8" aria-labelledby="invitation-heading">
    <h2 id="invitation-heading" className="display text-2xl">Invite a learner</h2>
    <p id="invitation-help" className="mt-3 text-[var(--muted)]">Send an invitation to the private beta. They’ll sign in with an email code and get their own learning workspace.</p>
    <form className="mt-6" onSubmit={submit} aria-busy={busy}>
      <label className="ui block text-sm font-bold" htmlFor="invitation-email">Learner’s email address</label>
      <input id="invitation-email" className="field mt-2" type="email" autoComplete="off" maxLength={254} required value={email} onChange={event => { setEmail(event.target.value); setError(""); setMessage(""); }} disabled={busy} aria-describedby="invitation-help" />
      {error ? <p className="ui mt-4 text-sm" role="alert">{error}</p> : null}
      {message ? <p className="ui mt-4 break-words text-sm text-[var(--success)]" role="status">{message}</p> : null}
      <button type="submit" className="button-primary mt-5" disabled={busy}>{busy ? "Sending invitation…" : "Send invitation"}</button>
    </form>
  </section>;
}
