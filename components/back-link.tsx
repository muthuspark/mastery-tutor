import Link from "next/link";
import type { ComponentProps } from "react";

export function BackLink({ children, className = "", ...props }: ComponentProps<typeof Link>) {
  return <Link {...props} className={`back-link ${className}`}><span aria-hidden="true">←</span>{children}</Link>;
}

export function BackToLearning() {
  return <nav aria-label="Back navigation" className="mb-6"><BackLink href="/">Back to learning</BackLink></nav>;
}
