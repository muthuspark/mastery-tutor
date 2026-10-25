import { requirePageUser } from "@/lib/access";
import { BackToLearning } from "@/components/back-link";
import { ProfileForm } from "@/components/profile-form";

export default async function SettingsPage() {
  await requirePageUser();
  return (
    <main id="main-content" tabIndex={-1} className="reading-shell">
      <BackToLearning />
      <header className="settings-intro"><h1 className="display">Profile settings</h1>
      </header>
      <ProfileForm />
    </main>
  );
}
