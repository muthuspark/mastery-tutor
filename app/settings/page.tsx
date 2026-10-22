import { BackToLearning } from "@/components/back-link";
import { ProfileForm } from "@/components/profile-form";

export default function SettingsPage() {
  return (
    <main id="main-content" tabIndex={-1} className="reading-shell">
      <BackToLearning />
      <header className="settings-intro"><p className="eyebrow mb-3">Make it personal</p><h1 className="display">Profile settings</h1>
      <p className="mt-4 max-w-prose text-lg text-[var(--muted)]">Choose your learning agent and shape explanations around your experience and goals.</p></header>
      <ProfileForm />
    </main>
  );
}
