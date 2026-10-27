import { AccountControls } from "./account-controls";
import Image from "next/image";
import Link from "next/link";

export function SiteHeader({ status }: { status?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <Image className="brand-mark" src="/brand-mark.svg" width={40} height={40} alt="" aria-hidden="true" priority />
        <span>Newton</span>
      </Link>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : <AccountControls />}
    </header>
  );
}
