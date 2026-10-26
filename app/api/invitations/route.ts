import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { authConfig, isOwner } from "@/lib/auth-config";
import { db } from "@/lib/db";
import { invitations } from "@/lib/db/schema";
import { invitationSchema } from "@/lib/invitation-schema";
import { sendInvitationEmail } from "@/lib/mailtrap";

export async function POST(request: Request) {
  const access = await authorize();
  if (access instanceof Response) return access;
  if (!isOwner(access.user.email)) return NextResponse.json({ error: { code: "forbidden", message: "Only the owner can invite learners." } }, { status: 403 });
  const parsed = invitationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Enter a valid email address." } }, { status: 400 });
  const { email } = parsed.data;
  try {
    // Keep access enabled even if delivery is uncertain; retrying safely resends the invitation.
    db.insert(invitations).values({ email, invitedBy: access.user.id, createdAt: new Date() }).onConflictDoNothing().run();
  } catch {
    return NextResponse.json({ error: { code: "database_error", message: "Could not save this invitation. Please try again.", retryable: true } }, { status: 500 });
  }
  try {
    await sendInvitationEmail(email, authConfig().baseURL);
    return NextResponse.json({ email, message: "Invitation accepted for sending. They can now sign in with this email address." });
  } catch {
    return NextResponse.json({ error: { code: "delivery_failed", message: "Access is enabled, but we could not confirm the invitation email was sent. Try again to resend it, or share the app link directly.", retryable: true } }, { status: 503 });
  }
}
