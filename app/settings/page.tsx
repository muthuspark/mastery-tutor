import { InvitationForm } from "@/components/invitation-form";
import { isOwner } from "@/lib/auth-config";
import { requirePageUser } from "@/lib/access";
import { ProfileForm } from "@/components/profile-form";
import Image from "next/image";
import "./settings.css";

export default async function SettingsPage() {
  const user = await requirePageUser();
  return (
    <main id="main-content" tabIndex={-1} className="reading-shell settings-page">
      <div className="settings-content">
      <header className="settings-intro">
        <div><div className="settings-title-row">
          <h1 className="display">Profile settings</h1>
        </div>
        <p>Help Newton explain things in a way that works for you.</p></div>
        <Image className="settings-art" src="/images/studies-books.webp" width={1774} height={887} sizes="160px" alt="" aria-hidden="true" />
      </header>
      <ProfileForm />
      {isOwner(user.email) ? <InvitationForm /> : null}
      </div>
    </main>
  );
}
