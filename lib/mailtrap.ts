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
export async function sendLoginCode(email: string, otp: string) {
  try {
    const response = await fetch("https://send.api.mailtrap.io/api/send", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.MAILTRAP_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: { email: process.env.FROM_EMAIL, name: "Mastery Tutor" },
        to: [{ email }], subject: "Your Mastery Tutor login code",
        text: `Your Mastery Tutor login code is ${otp}.\n\nIt expires in five minutes and can only be used once.\nIf you did not request this code, ignore this email.`,
        category: "Login",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok || result?.success !== true || !Array.isArray(result.message_ids) || !result.message_ids.length) throw new DeliveryError();
    const state = delivery.getStore();
    if (state) state.accepted = true;
  } catch { throw new DeliveryError(); }
}
