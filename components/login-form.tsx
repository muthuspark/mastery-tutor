"use client";
import { FormEvent, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!cooldown) return;
    const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);
  useEffect(() => { if (sent) codeRef.current?.focus(); }, [sent]);
  async function requestCode() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/email-otp/send-verification-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, type: "sign-in" }) });
      const body = await response.json();
      if (!response.ok) {
        if (response.status === 429) setCooldown(Number(response.headers.get("Retry-After")) || 60);
        throw new Error(body?.error?.message ?? "Could not send your code. Please try again.");
      }
      setSent(true); setCode(""); setCooldown(60);
      codeRef.current?.focus();
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!sent) return requestCode();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-in/email-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp: code }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body?.error?.message ?? "Could not verify your code. Please try again.");
      await queryClient.cancelQueries(); queryClient.clear();
      sessionStorage.removeItem("mastery-user");
      const channel = new BroadcastChannel("mastery-session"); channel.postMessage("changed"); channel.close();
      window.location.replace("/");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not connect. Please try again."); setBusy(false); }
  }
  return <form onSubmit={submit} className="login-form" aria-busy={busy}>
    {sent ? <>
      <p id="code-help" className="login-description text-[var(--muted)]">Check <strong className="break-all">{email.trim().toLowerCase()}</strong> for your code. It expires in five minutes.</p>
      <label className="ui mt-6 block text-sm font-bold" htmlFor="login-code">Login code</label>
      <input ref={codeRef} id="login-code" className="field mt-2 login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "code-help login-error" : "code-help"} />
    </> : <>
      <label className="ui login-email-label" htmlFor="login-email"><svg aria-hidden="true" viewBox="0 0 24 18" width="26" height="20" fill="none" shapeRendering="crispEdges"><path d="M1 1h22v16H1z" stroke="currentColor"/><path fill="currentColor" d="M2 2h2v2H2zm2 2h3v2H4zm3 2h3v2H7zm3 2h4v2h-4zm4-2h3v2h-3zm3-2h3v2h-3zm3-2h2v2h-2zM2 14h2v2H2zm2-2h3v2H4zm3-2h2v2H7zm13 4h2v2h-2zm-3-2h3v2h-3zm-2-2h2v2h-2z"/></svg>Email address</label>
      <input ref={emailRef} id="login-email" className="field mt-2" type="email" autoComplete="email" placeholder="you@example.com" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} aria-invalid={!!error} aria-describedby={error ? "login-error" : undefined} />
    </>}
    {error ? <p id="login-error" role="alert" className="ui mt-4 text-sm text-[var(--accent-dark)]">{error}</p> : null}
    <button type="submit" className="button-primary mt-4 w-full" disabled={busy || (!sent && cooldown > 0)}>
      <span>{busy ? (sent ? "Signing in…" : "Sending code…") : sent ? "Sign in" : cooldown ? `Try again in ${cooldown}s` : "Email me a code"}</span>
      <svg className="login-submit-arrow" aria-hidden="true" viewBox="0 0 24 24" width="24" height="24" fill="currentColor" shapeRendering="crispEdges"><path d="M13 4h3v3h3v3h3v3h-3v3h-3v3h-3v-3h3v-3H2v-3h14V7h-3z" /></svg>
    </button>
    {sent ? <div className="login-recovery ui">
      <button type="button" className="button-secondary" disabled={busy || cooldown > 0} onClick={() => void requestCode()}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>
      <button type="button" className="button-tertiary" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); setCooldown(0); setTimeout(() => emailRef.current?.focus(), 0); }}>Change email</button>
    </div> : null}
    {!sent ? <p className="login-invitation ui mt-8 text-sm text-[var(--muted)]">Access is by invitation.</p> : null}
  </form>;
}
