import "server-only";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { invitations } from "./db/schema";
import { isConfiguredInvite, normalizeEmail } from "./auth-config";

export function isInvited(email: string) {
  return isConfiguredInvite(email) || !!db.select({ email: invitations.email }).from(invitations)
    .where(eq(invitations.email, normalizeEmail(email))).get();
}
