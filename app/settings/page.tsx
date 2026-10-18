import Link from "next/link";
import { ProfileForm } from "@/components/profile-form";

export default function SettingsPage() {
  return (
    <main className="reading-shell">
      <nav aria-label="Back navigation">
        <Link className="eyebrow underline-offset-4" href="/">← Back to learning</Link>
      </nav>
      <h1 className="display mt-10 text-4xl">Profile settings</h1>
      <p className="mt-4 max-w-prose text-lg text-[var(--muted)]">Help us shape explanations around your experience and goals.</p>
      <ProfileForm />
    </main>
  );
}
