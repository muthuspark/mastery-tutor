import Image from "next/image";
import Link from "next/link";
import mandala from "@/app/mandala.png";

export function SiteHeader({ status }: { status?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <Image className="brand-mark" src={mandala} alt="" aria-hidden="true" priority />
        <span>Mastery Tutor</span>
      </Link>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : <nav aria-label="Main navigation"><Link className="home-settings" href="/settings">Profile settings <span aria-hidden="true">↗</span></Link></nav>}
    </header>
  );
}
