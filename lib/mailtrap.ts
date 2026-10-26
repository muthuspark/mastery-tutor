import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";

const delivery = new AsyncLocalStorage<{ accepted: boolean }>();
export async function confirmLoginDelivery<T>(work: () => Promise<T>) {
  const state = { accepted: false };
  const result = await delivery.run(state, work);
  return { result, accepted: state.accepted };
}

export class DeliveryError extends Error {
  constructor() { super("We could not send your code. Please try again shortly."); }
}
async function sendEmail(email: string, subject: string, text: string, category: string) {
  try {
    const response = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MAILTRAP_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: process.env.FROM_EMAIL, name: "Mastery Tutor" },
        to: [{ email }], subject, text, category,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true || !Array.isArray(result.message_ids) || !result.message_ids.length) throw new DeliveryError();
  } catch { throw new DeliveryError(); }
}
export async function sendLoginCode(email: string, otp: string) {
  await sendEmail(email, "Your Mastery Tutor login code",
    `Your Mastery Tutor login code is ${otp}.\n\nIt expires in five minutes and can only be used once.\nIf you did not request this code, ignore this email.`, "Login");
  const state = delivery.getStore();
  if (state) state.accepted = true;
}
export async function sendInvitationEmail(email: string, appURL: string) {
  await sendEmail(email, "You’re invited to Mastery Tutor",
    `You’re invited to the Mastery Tutor private beta.\n\nOpen ${appURL} and sign in with this email address. We’ll email you a six-digit login code when you sign in.\n\nCreate a course, study at your own pace, and return to your private learning workspace anytime.\n\nIf you weren’t expecting this invitation, you can ignore this email.`, "Invitation");
}
