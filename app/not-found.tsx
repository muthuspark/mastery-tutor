import { BackToLearning } from "@/components/back-link";

export default function NotFound() {
  return <main id="main-content" tabIndex={-1} className="reading-shell">
    <h1 className="display text-4xl">Page not found</h1>
    <p className="mt-5 text-[var(--muted)]">This page is unavailable. Return to your studies to continue learning.</p>
    <div className="mt-8"><BackToLearning /></div>
  </main>;
}
