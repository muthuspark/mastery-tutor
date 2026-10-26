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
      <p id="code-help" className="text-[var(--muted)]">We requested a login code for <strong className="break-all">{email.trim().toLowerCase()}</strong>. Check your inbox and spam folder. It expires in five minutes.</p>
      <label className="ui mt-6 block text-sm font-bold" htmlFor="login-code">Login code</label>
      <input ref={codeRef} id="login-code" className="field mt-2 login-code" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} disabled={busy} aria-describedby={error ? "code-help login-error" : "code-help"} />
    </> : <>
      <p className="text-[var(--muted)]">Use your invited email to enter your private learning workspace.</p>
      <label className="ui mt-6 block text-sm font-bold" htmlFor="login-email">Email address</label>
      <input ref={emailRef} id="login-email" className="field mt-2" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} disabled={busy} aria-describedby={error ? "login-error" : undefined} />
    </>}
    {error ? <p id="login-error" role="alert" className="ui mt-4 text-sm text-[var(--accent-dark)]">{error}</p> : null}
    <button type="submit" className="button-primary mt-4 w-full" disabled={busy || (!sent && cooldown > 0)}>{busy ? (sent ? "Signing in…" : "Sending code…") : sent ? "Sign in" : cooldown ? `Try again in ${cooldown}s` : "Email me a code"}</button>
    {sent ? <div className="ui mt-5 flex flex-wrap justify-between gap-4 text-sm">
      <button type="button" className="underline disabled:opacity-50" disabled={busy || cooldown > 0} onClick={() => void requestCode()}>{cooldown ? `Resend in ${cooldown}s` : "Resend code"}</button>
      <button type="button" className="underline" disabled={busy} onClick={() => { setSent(false); setCode(""); setError(""); setCooldown(0); setTimeout(() => emailRef.current?.focus(), 0); }}>Change email</button>
    </div> : null}
    <p className="ui mt-8 text-sm text-[var(--muted)]">Private beta. Access is by invitation.</p>
  </form>;
}
