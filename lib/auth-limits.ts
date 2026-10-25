import { createHash } from "node:crypto";
import { and, eq, lt } from "drizzle-orm";
import { db } from "./db";
import { authLimits } from "./db/schema";

export class LoginLimitError extends Error {
  constructor(readonly retryAfter: number) { super("Please wait before trying again."); }
}
export const emailKey = (email: string) => createHash("sha256").update(email).digest("hex");
// One immediate SQLite transaction checks and increments every window together.
export function takeLoginLimits(email: string, ip: string, sending: boolean, now = Date.now()) {
  const rules: [string, number, number][] = sending
    ? [[`cooldown:${emailKey(email)}`, 1, 60_000], [`email:${emailKey(email)}`, 5, 3_600_000], [`send-ip:${emailKey(ip)}`, 20, 3_600_000]]
    : [[`verify-email:${emailKey(email)}`, 20, 3_600_000], [`verify-ip:${emailKey(ip)}`, 100, 3_600_000]];
  db.transaction(() => {
    db.delete(authLimits).where(lt(authLimits.resetAt, now)).run();
    for (const [key, max] of rules) {
      const row = db.select().from(authLimits).where(eq(authLimits.key, key)).get();
      if (row && row.resetAt > now && row.count >= max) throw new LoginLimitError(Math.ceil((row.resetAt - now) / 1000));
    }
    for (const [key, , window] of rules) {
      const row = db.select().from(authLimits).where(eq(authLimits.key, key)).get();
      db.insert(authLimits).values({ key, count: 1, resetAt: now + window }).onConflictDoUpdate({ target: authLimits.key, set: row && row.resetAt > now ? { count: row.count + 1 } : { count: 1, resetAt: now + window } }).run();
    }
  }, { behavior: "immediate" });
}
// Serialize send/verify for an address across processes as well as requests. A crash releases
// the lease after 30 seconds; delivery has a shorter timeout and cannot leave a valid failed OTP.
export function claimLoginLease(email: string, now = Date.now()) {
  const key = `lease:${emailKey(email)}`;
  const lease = now + 30_000;
  const result = db.insert(authLimits).values({ key, count: 0, resetAt: lease })
    .onConflictDoUpdate({ target: authLimits.key, set: { resetAt: lease }, setWhere: lt(authLimits.resetAt, now) }).run();
  if (!result.changes) throw new LoginLimitError(30);
  return () => { db.delete(authLimits).where(and(eq(authLimits.key, key), eq(authLimits.resetAt, lease))).run(); };
}
