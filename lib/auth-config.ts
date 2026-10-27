import { z } from "zod";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();
export function ownerEmail() {
  const email = normalizeEmail(process.env.OWNER_EMAIL ?? "");
  if (!z.email().safeParse(email).success) throw new Error("Configure OWNER_EMAIL before migrating or starting Newton.");
  return email;
}
export const isOwner = (email: string) => normalizeEmail(email) === ownerEmail();
export function isConfiguredInvite(email: string) {
  const invited = (process.env.INVITED_EMAILS ?? "").split(/[;,\n]/).map(normalizeEmail).filter(Boolean);
  return new Set([ownerEmail(), ...invited]).has(normalizeEmail(email));
}
export function authConfig() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Configure BETTER_AUTH_SECRET with at least 32 random characters.");
  const url = process.env.BETTER_AUTH_URL;
  if (!url || !z.url().safeParse(url).success || !/^https?:\/\//.test(url)) throw new Error("Configure BETTER_AUTH_URL with the application's full URL.");
  if (process.env.NODE_ENV === "production" && !url.startsWith("https://")) throw new Error("BETTER_AUTH_URL must use HTTPS in production.");
  ownerEmail();
  if (!process.env.MAILTRAP_API_KEY?.trim() || !z.email().safeParse(process.env.FROM_EMAIL).success) throw new Error("Configure MAILTRAP_API_KEY and FROM_EMAIL for login email delivery.");
  if (!["codex", "claude", "deepseek"].includes(process.env.AI_PROVIDER ?? "")) throw new Error("Configure AI_PROVIDER as codex, claude, or deepseek.");
  return { secret, baseURL: new URL(url).origin };
}
