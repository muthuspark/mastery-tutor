import { isInvited } from "@/lib/invitations";
import { confirmLoginDelivery } from "@/lib/mailtrap";
import { NextResponse } from "next/server";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getAuth } from "@/lib/auth";
import { authConfig, normalizeEmail } from "@/lib/auth-config";
import { currentUser } from "@/lib/access";
import { claimLoginLease, LoginLimitError, takeLoginLimits } from "@/lib/auth-limits";
import { recordAuthEvent } from "@/lib/auth-events";
import { db } from "@/lib/db";
import { verification } from "@/lib/db/schema";

export const runtime = "nodejs";
function failure(code: string, message: string, status: number, retryAfter?: number) {
  return NextResponse.json({ error: { code, message, retryable: status >= 500 || status === 429 } }, { status, headers: { "Cache-Control": "no-store", ...(retryAfter ? { "Retry-After": String(retryAfter) } : {}) } });
}
export async function GET(request: Request) {
  if (new URL(request.url).pathname !== "/api/auth/get-session") return failure("not_found", "Not found.", 404);
  const user = await currentUser(request.headers);
  return NextResponse.json(user ? { user: { id: user.id, email: user.email } } : null, { headers: { "Cache-Control": "no-store" } });
}
export async function POST(request: Request) {
  const path = new URL(request.url).pathname;
  const sending = path === "/api/auth/email-otp/send-verification-otp";
  const verifying = path === "/api/auth/sign-in/email-otp";
  const logout = path === "/api/auth/sign-out";
  if (!sending && !verifying && !logout) return failure("not_found", "Not found.", 404);
  const { baseURL } = authConfig();
  // Reject cross-origin writes before either delivery or session work. JSON-only requests
  // without Origin are supported for same-origin/native clients; browser forms cannot use them.
  if (request.headers.get("origin") && request.headers.get("origin") !== baseURL) return failure("forbidden", "Request not allowed.", 403);
  if (!request.headers.get("content-type")?.startsWith("application/json")) return failure("invalid_input", "Send a JSON request.", 400);
  if (logout) return getAuth().handler(request);
  const body = await request.json().catch(() => null);
  const email = normalizeEmail(typeof body?.email === "string" ? body.email : "");
  if (!z.email().safeParse(email).success || (sending && body?.type !== "sign-in") || (verifying && (typeof body?.otp !== "string" || !/^\d{6}$/.test(body.otp)))) return failure("invalid_input", "Enter a valid email and six-digit code.", 400);
  if (!isInvited(email)) return failure("invitation_only", "Newton is invitation-only. Use your invited email address.", 403);
  let release: (() => void) | undefined;
  try {
    // Only trust a forwarding header explicitly configured by an operator whose proxy
    // strips incoming copies. Otherwise use one conservative shared network bucket.
    const ip = process.env.AUTH_TRUSTED_IP_HEADER ? request.headers.get(process.env.AUTH_TRUSTED_IP_HEADER)?.split(",")[0].trim() ?? "unknown" : "unknown";
    takeLoginLimits(email, ip, sending);
    release = claimLoginLease(email);
    if (sending) {
      recordAuthEvent("code_requested");
      db.delete(verification).where(eq(verification.identifier, `sign-in-otp-${email}`)).run();
    }
    const confirmed = await confirmLoginDelivery(() => getAuth().handler(new Request(request.url, {
      method: "POST", headers: request.headers,
      body: JSON.stringify(sending ? { email, type: "sign-in" } : { email, otp: body.otp }),
    })));
    const response = confirmed.result;
    if (sending) {
      if (!response.ok || !confirmed.accepted) throw new Error("Delivery failed");
      recordAuthEvent("provider_accepted");
      return NextResponse.json({ success: true }, { headers: { "Cache-Control": "no-store" } });
    }
    if (!response.ok) return failure("invalid_code", "This code is incorrect, expired, or already used. Try again or request a new code.", 400);
    const result = await response.json();
    recordAuthEvent("verified", result.user.id);
    // Session credentials stay in HTTP-only cookies, never JSON or browser storage.
    const responseHeaders = new Headers(response.headers);
    responseHeaders.set("Cache-Control", "no-store");
    return NextResponse.json({ success: true }, { headers: responseHeaders });
  } catch (error) {
    if (error instanceof LoginLimitError) return failure("rate_limited", "Please wait before trying again.", 429, error.retryAfter);
    if (sending) {
      db.delete(verification).where(eq(verification.identifier, `sign-in-otp-${email}`)).run();
      recordAuthEvent("provider_failed");
    }
    return failure("service_unavailable", sending ? "We could not send your code. Please try again shortly." : "We could not sign you in. Please try again.", 503);
  } finally { release?.(); }
}
