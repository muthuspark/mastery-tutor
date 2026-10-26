import { isInvited } from "./invitations";
import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { emailOTP } from "better-auth/plugins";
import { APIError } from "better-auth/api";
import { db } from "./db";
import * as schema from "./db/schema";
import { authConfig } from "./auth-config";
import { sendLoginCode } from "./mailtrap";

function createAuth() {
  return betterAuth({
    ...authConfig(),
    appName: "Mastery Tutor",
    database: drizzleAdapter(db, { provider: "sqlite", schema }),
    emailAndPassword: { enabled: false },
    session: { expiresIn: 7 * 24 * 60 * 60, disableSessionRefresh: true, cookieCache: { enabled: false } },
    // The public handler applies atomic persistent limits to every exposed auth operation.
    rateLimit: { enabled: false },
    logger: { disabled: true },
    databaseHooks: { user: { create: { before: async (user) => {
      if (!isInvited(user.email)) throw new APIError("FORBIDDEN", { message: "This beta is invitation-only." });
      return { data: user };
    } } } },
    plugins: [emailOTP({
      otpLength: 6, expiresIn: 300, allowedAttempts: 3, storeOTP: "hashed", resendStrategy: "rotate",
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in" || !isInvited(email)) throw new APIError("FORBIDDEN", { message: "This beta is invitation-only." });
        await sendLoginCode(email, otp);
      },
    })],
  });
}
let instance: ReturnType<typeof createAuth> | undefined;
export function getAuth() { return instance ??= createAuth(); }
