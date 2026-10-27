"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
export function AccountControls() {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (pathname === "/login") return <span className="login-beta">Private beta</span>;
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
  return <nav aria-label="Main navigation" className="ui flex flex-wrap items-center justify-end gap-x-5 gap-y-2 text-sm">
    <Link className="home-settings" href="/settings">Profile settings <span aria-hidden="true">↗</span></Link>
    <button onClick={() => void logout()} disabled={busy} className="underline">{busy ? "Signing out…" : "Sign out"}</button>
    {error ? <span role="alert">{error}</span> : null}
  </nav>;
}
