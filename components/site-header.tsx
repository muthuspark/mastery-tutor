import Link from "next/link";

export function SiteHeader({ status }: { status?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand eyebrow" href="/">Mastery Tutor</Link>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : <Link className="home-settings ui text-sm" href="/settings">Profile settings</Link>}
    </header>
  );
}
