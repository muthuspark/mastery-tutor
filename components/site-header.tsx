import { AccountControls } from "./account-controls";
import { currentUser } from "@/lib/access";
import { HeaderShell } from "./site-header-shell";

export async function SiteHeader({ status }: { status?: string }) {
  const user = await currentUser();
  return (
    <HeaderShell href={user ? "/" : "/login"}>
      {status ? <span className="site-header-status ui text-sm text-[var(--muted)]">{status}</span> : user ? <AccountControls /> : null}
    </HeaderShell>
  );
}
