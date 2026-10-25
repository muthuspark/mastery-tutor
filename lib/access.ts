import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { authConfig, isInvited } from "./auth-config";
import { db } from "./db";
import { chapters, courses } from "./db/schema";

export async function currentUser(requestHeaders?: Headers) {
  const result = await getAuth().api.getSession({ headers: requestHeaders ?? await headers() });
  return result && isInvited(result.user.email) ? result.user : null;
}
export async function requirePageUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}
export async function authorize(kind?: "course" | "chapter", params?: { id: string }) {
  const requestHeaders = await headers();
  const origin = requestHeaders.get("origin");
  if (origin && origin !== authConfig().baseURL) return NextResponse.json({ error: { code: "forbidden", message: "Request not allowed." } }, { status: 403 });
  const user = await currentUser(requestHeaders);
  if (!user) return NextResponse.json({ error: { code: "unauthenticated", message: "Sign in to continue." } }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (kind && params) {
    const owned = kind === "course"
      ? db.select({ id: courses.id }).from(courses).where(and(eq(courses.id, params.id), eq(courses.userId, user.id))).get()
      : db.select({ id: chapters.id }).from(chapters).innerJoin(courses, eq(chapters.courseId, courses.id)).where(and(eq(chapters.id, params.id), eq(courses.userId, user.id))).get();
    if (!owned) return NextResponse.json({ error: { code: "not_found", message: "Resource not found." } }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return { user };
}
