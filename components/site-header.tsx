import Link from "next/link";
import { LearningAgentStatus } from "./learning-agent-status";

export function SiteHeader({ status }: { status?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <svg className="brand-mark" aria-hidden="true" viewBox="0 0 24 24" fill="none"><path d="M12 5v15M3 4.5c3.2-.8 6.2-.3 9 1.5 2.8-1.8 5.8-2.3 9-1.5V18c-3.2-.8-6.2-.3-9 1.5C9.2 17.7 6.2 17.2 3 18V4.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" /></svg>
        <span>Mastery Tutor</span>
      </Link>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : <nav aria-label="Main navigation" className="flex flex-col items-end gap-1"><LearningAgentStatus /><Link className="home-settings" href="/settings">Profile settings <span aria-hidden="true">↗</span></Link></nav>}
    </header>
  );
}
