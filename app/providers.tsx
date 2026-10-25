"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  useEffect(() => {
    // Full document navigation discards both React state and server component caches.
    // Other tabs are checked on focus and notified immediately after account changes.
    let disposed = false;
    async function check() {
      if (window.location.pathname === "/login") return;
      try {
        const response = await fetch("/api/auth/get-session", { cache: "no-store" });
        if (!response.ok) return;
        const session = await response.json();
        const previous = sessionStorage.getItem("mastery-user");
        if (!session?.user || (previous && previous !== session.user.id)) {
          await queryClient.cancelQueries(); queryClient.clear();
          sessionStorage.removeItem("mastery-user");
          if (!disposed) window.location.replace("/login");
        } else sessionStorage.setItem("mastery-user", session.user.id);
      } catch { /* A network failure is handled by the current screen's retry controls. */ }
    }
    const channel = new BroadcastChannel("mastery-session");
    channel.onmessage = () => { queryClient.clear(); window.location.replace("/login"); };
    const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) window.location.reload(); };
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", check);
    const timer = setInterval(check, 30_000);
    void check();
    return () => { disposed = true; channel.close(); clearInterval(timer); window.removeEventListener("focus", check); window.removeEventListener("pageshow", onPageShow); };
  }, [queryClient]);
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
