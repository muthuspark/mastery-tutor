/** @jsxImportSource react */
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

export function HeaderShell({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <header className="site-header">
      <Link className="site-brand" href={href}>
        <Image className="brand-logo" src="/images/newton-logo.svg" width={143} height={36} alt="Newton" loading="eager" />
      </Link>
      {children}
    </header>
  );
}

export function SiteHeaderFallback() {
  return <HeaderShell href="/login" />;
}
