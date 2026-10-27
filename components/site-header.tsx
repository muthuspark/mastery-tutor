import { AccountControls } from "./account-controls";
import Image from "next/image";
import Link from "next/link";

export function SiteHeader({ status }: { status?: string }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href="/">
        <Image className="brand-logo" src="/images/newton-logo.svg" width={143} height={36} alt="Newton" loading="eager" />
      </Link>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : <AccountControls />}
    </header>
  );
}
