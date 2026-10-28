"use client";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
export function AccountControls() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function logout() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/sign-out", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      if (!response.ok) throw new Error();
      await queryClient.cancelQueries(); queryClient.clear();
      sessionStorage.removeItem("mastery-user");
      const channel = new BroadcastChannel("mastery-session"); channel.postMessage("changed"); channel.close();
      window.location.replace("/login");
    } catch { setError("Could not sign out. Try again."); setBusy(false); }
  }
  return <nav aria-label="Main navigation" className="account-navigation">
    <Link className="account-control" href="/settings" aria-label="Profile settings">
      <svg className="account-icon" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path fillRule="evenodd" d="M6 0h4v2h2v2h2v2h2v4h-2v2h-2v2h-2v2H6v-2H4v-2H2v-2H0V6h2V4h2V2h2V0Zm0 5v1H5v4h1v1h4v-1h1V6h-1V5H6Z" /></svg>
      <span>Settings</span>
    </Link>
    <button onClick={() => void logout()} disabled={busy} className="account-control">
      <svg className="account-icon" viewBox="0 0 16 16" fill="currentColor" shapeRendering="crispEdges" aria-hidden="true"><path d="M1 1h7v2H3v10h5v2H1V1Zm10 3h2v2h2v1h1v2h-1v1h-2v2h-2V9H6V7h5V4Z" /></svg>
      <span>{busy ? "Signing out…" : "Sign out"}</span>
    </button>
    {error ? <span role="alert">{error}</span> : null}
  </nav>;
}
