import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ headers: new Headers(), codes: new Map<string, string>(), deliveryFailure: false }));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("@/lib/db", async () => {
  const schema = await import("./db/schema");
  const sqlite = new Database(":memory:"); sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema }); migrate(db, { migrationsFolder: "drizzle" });
  return { db, sqlite };
});
vi.mock("@/lib/agent", async (original) => ({ ...await original<typeof import("./agent")>(), agentForRequest: vi.fn().mockResolvedValue("codex"), runAgentObject: vi.fn() }));
import { db } from "./db";
import { authLimits, authEvents, verification, user, session, courses, chapters, learnerProfile, generationJobs, invitations } from "./db/schema";
import { POST, GET } from "@/app/api/auth/[...all]/route";
import { GET as listCourses, POST as createCourse } from "@/app/api/courses/route";
import { GET as getCourse, PATCH as patchCourse } from "@/app/api/courses/[id]/route";
import { GET as exportCourse } from "@/app/api/courses/[id]/export/route";
import { POST as retryCourse } from "@/app/api/courses/[id]/retry/route";
import { GET as getChapter, POST as adjustChapter } from "@/app/api/chapters/[id]/route";
import { GET as quiz } from "@/app/api/chapters/[id]/quiz/route";
import { POST as retryQuiz } from "@/app/api/chapters/[id]/quiz/retry/route";
import { POST as attempt } from "@/app/api/chapters/[id]/attempts/route";
import { POST as regenerate } from "@/app/api/chapters/[id]/regenerate/route";
import { POST as revisit } from "@/app/api/chapters/[id]/revisit/route";
import { POST as practice } from "@/app/api/chapters/[id]/socratic/route";
import { GET as explanations, POST as explain } from "@/app/api/chapters/[id]/explanations/route";
import { POST as retryExplanation } from "@/app/api/chapters/[id]/explanations/[explanationId]/retry/route";
import { GET as getProfile, PUT as putProfile } from "@/app/api/profile/route";
import { POST as invite } from "@/app/api/invitations/route";
import { courseProfilePrompt } from "./profile";
import { claimLoginLease, takeLoginLimits } from "./auth-limits";
import { runAgentObject } from "./agent";
import { claimGenerationJob } from "./generation";
import { processGenerationJob } from "./generation-worker";
import { samplePlan } from "../test/quality-fixtures";

const request = (path: string, body: unknown = {}) => new Request(`http://localhost:3100/api/auth/${path}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: "http://localhost:3100", ...Object.fromEntries(state.headers) }, body: JSON.stringify(body) });
const send = (email = "owner@example.com") => POST(request("email-otp/send-verification-otp", { email, type: "sign-in" }));
const verify = (email: string, otp: string) => POST(request("sign-in/email-otp", { email, otp }));
const clearLimits = () => db.delete(authLimits).run();
async function login(email = "owner@example.com") {
  clearLimits(); expect((await send(email)).status).toBe(200);
  const response = await verify(email, state.codes.get(email)!);
  expect(response.status).toBe(200);
  state.headers = new Headers({ cookie: response.headers.getSetCookie().map((v) => v.split(";")[0]).join("; ") });
  return db.select().from(user).where(eq(user.email, email)).get()!;
}
beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_SECRET", "test-secret-that-is-at-least-thirty-two-characters");
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3100");
  vi.stubEnv("OWNER_EMAIL", " Owner@Example.com "); vi.stubEnv("INVITED_EMAILS", "second@example.com");
  vi.stubEnv("MAILTRAP_API_KEY", "sentinel-mailtrap-secret"); vi.stubEnv("FROM_EMAIL", "tutor@example.com"); vi.stubEnv("AI_PROVIDER", "codex");
  db.delete(invitations).run(); db.delete(generationJobs).run(); db.delete(courses).run(); db.delete(learnerProfile).run(); db.delete(authEvents).run(); db.delete(session).run(); db.delete(user).run(); db.delete(verification).run(); clearLimits();
  state.headers = new Headers(); state.codes.clear(); state.deliveryFailure = false;
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const body = JSON.parse(options!.body as string);
    if (body.category === "Login") state.codes.set(body.to[0].email, /code is (\d{6})/.exec(body.text)![1]);
    return state.deliveryFailure ? Response.json({ error: "sentinel-mailtrap-secret" }, { status: 500 }) : Response.json({ success: true, message_ids: ["accepted"] });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("private beta authentication", () => {
  it("normalizes invited emails, hashes codes, creates accounts once, and invalidates logout sessions", async () => {
    expect((await send("  OWNER@EXAMPLE.COM ")).status).toBe(200);
    const code = state.codes.get("owner@example.com")!;
    expect(code).toMatch(/^\d{6}$/); expect(JSON.stringify(db.select().from(verification).all())).not.toContain(code);
    const response = await verify("owner@example.com", code); expect(response.status).toBe(200);
    expect(await response.clone().json()).toEqual({ success: true });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    const saved = db.select().from(session).get()!;
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(7 * 86400_000);
    expect((await verify("owner@example.com", code)).status).toBe(400);
    state.headers.set("cookie", response.headers.getSetCookie().map(v => v.split(";")[0]).join("; "));
    expect((await listCourses()).status).toBe(200);
    expect((await POST(request("sign-out"))).status).toBe(200);
    expect((await listCourses()).status).toBe(401);
    expect(db.select().from(session).all()).toHaveLength(0);
  });
  it("verifies a reserved migration owner without changing their user id or learning data", async () => {
    db.insert(user).values({ id: "reserved-owner", email: "owner@example.com", name: "", emailVerified: false, createdAt: new Date(), updatedAt: new Date() }).run();
    db.insert(courses).values({ id: "legacy-owned", userId: "reserved-owner", topic: "Legacy learning", createdAt: new Date() }).run();
    db.insert(learnerProfile).values({ userId: "reserved-owner", aboutMe: "Legacy background", updatedAt: new Date() }).run();
    const signedIn = await login(); expect(signedIn.id).toBe("reserved-owner"); expect(signedIn.emailVerified).toBe(true);
    expect((await (await listCourses()).json()).courses[0].topic).toBe("Legacy learning");
    expect(await (await getProfile()).json()).toEqual({ aboutMe: "Legacy background" });
  });
  it("blocks uninvited sends, signups, removed invites, and disabled authentication endpoints", async () => {
    expect((await send("stranger@example.com")).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
    expect((await verify("stranger@example.com", "123456")).status).toBe(403);
    expect((await POST(request("sign-up/email", { email: "second@example.com", password: "password" }))).status).toBe(404);
    await login("second@example.com");
    vi.stubEnv("INVITED_EMAILS", "");
    expect((await listCourses()).status).toBe(401);
    expect(await (await GET(new Request("http://localhost:3100/api/auth/get-session", { headers: state.headers }))).json()).toBeNull();
    clearLimits(); vi.stubEnv("INVITED_EMAILS", "second@example.com"); await send("second@example.com");
    vi.stubEnv("INVITED_EMAILS", ""); expect((await verify("second@example.com", state.codes.get("second@example.com")!)).status).toBe(403);
  });
  it("rejects exhausted, expired, replaced, and concurrently replayed codes", async () => {
    await send(); const first = state.codes.get("owner@example.com")!;
    for (let i = 0; i < 3; i++) expect((await verify("owner@example.com", first === "000000" ? "111111" : "000000")).status).toBe(400);
    expect((await verify("owner@example.com", first)).status).toBe(400);
    clearLimits(); await send();
    db.update(verification).set({ expiresAt: new Date(Date.now() - 1000) }).run();
    expect((await verify("owner@example.com", state.codes.get("owner@example.com")!)).status).toBe(400);
    clearLimits(); await send(); const old = state.codes.get("owner@example.com")!;
    clearLimits(); await send(); const next = state.codes.get("owner@example.com")!;
    if (next !== old) expect((await verify("owner@example.com", old)).status).toBe(400);
    const results = await Promise.all([verify("owner@example.com", next), verify("owner@example.com", next)]);
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(db.select().from(session).all()).toHaveLength(1);
  });
  it("enforces persistent cooldown, per-email/IP limits, leases, and concurrent send limits", async () => {
    const responses = await Promise.all(Array.from({ length: 8 }, () => send()));
    expect(responses.filter(r => r.status === 200)).toHaveLength(1); expect(fetch).toHaveBeenCalledTimes(1);
    expect((await send()).headers.get("Retry-After")).toBeTruthy();
    clearLimits(); const now = Date.now();
    for (let i = 0; i < 5; i++) takeLoginLimits("owner@example.com", "ip", true, now + i * 61_000);
    expect(() => takeLoginLimits("owner@example.com", "ip", true, now + 5 * 61_000)).toThrow();
    clearLimits(); for (let i = 0; i < 20; i++) takeLoginLimits(`${i}@example.com`, "ip", true, now);
    expect(() => takeLoginLimits("other@example.com", "ip", true, now)).toThrow();
    clearLimits(); const release = claimLoginLease("owner@example.com"); expect(() => claimLoginLease("owner@example.com")).toThrow(); release(); expect(() => claimLoginLease("owner@example.com")).not.toThrow();
  });
  it("invalidates failed/uncertain email delivery and hides provider errors", async () => {
    state.deliveryFailure = true; const response = await send(); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("sentinel-mailtrap-secret");
    expect(db.select().from(verification).all()).toHaveLength(0);
    expect(db.select().from(authEvents).all().map(e => e.event)).toContain("provider_failed");
  });
  it.each(["uncertain", "network"])("rejects %s Mailtrap outcomes without leaving a usable code", async (mode) => {
    vi.stubGlobal("fetch", mode === "network" ? vi.fn().mockRejectedValue(new Error("private credential")) : vi.fn().mockResolvedValue(Response.json({ success: true })));
    const response = await send(); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private credential");
    expect(db.select().from(verification).all()).toHaveLength(0);
  });
  it("rejects cross-origin writes and expired sessions", async () => {
    const bad = request("email-otp/send-verification-otp", { email: "owner@example.com", type: "sign-in" }); bad.headers.set("origin", "https://evil.example");
    expect((await POST(bad)).status).toBe(403); expect(fetch).not.toHaveBeenCalled();
    await login(); db.update(session).set({ expiresAt: new Date(Date.now() - 1000) }).run(); expect((await listCourses()).status).toBe(401);
  });
});

it("protects every learning resource and isolates courses, profiles, and generation context", async () => {
  const owner = await login();
  await putProfile(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ aboutMe: "Owner background" }) }));
  const response = await createCourse(new Request("http://localhost", { method: "POST", body: JSON.stringify({ topic: "Owner private course", userId: "spoof" }) }));
  const { courseId } = await response.json(); expect(db.select().from(courses).get()?.userId).toBe(owner.id);
  db.insert(chapters).values({ id: "owner-chapter", courseId, idx: 0, title: "Private lesson", status: "open", content: "Private contents", objectives: [], prerequisites: [], createdAt: new Date() }).run();
  const cookie = new Headers(state.headers);
  const second = await login("second@example.com");
  expect(await (await listCourses()).json()).toEqual({ courses: [] }); expect(await (await getProfile()).json()).toEqual({ aboutMe: "" });
  await putProfile(new Request("http://localhost", { method: "PUT", body: JSON.stringify({ aboutMe: "Second learner" }) }));
  expect(courseProfilePrompt(courseId)).toContain("Owner background"); expect(courseProfilePrompt(courseId)).not.toContain("Second learner");
  const courseContext = { params: Promise.resolve({ id: courseId }) };
  const chapterContext = { params: Promise.resolve({ id: "owner-chapter", explanationId: "private-explanation" }) };
  const handlers = [() => getCourse(new Request("http://localhost"), courseContext), () => patchCourse(new Request("http://localhost", { method: "PATCH", body: "{}" }), courseContext), () => exportCourse(new Request("http://localhost"), courseContext), () => retryCourse(new Request("http://localhost"), courseContext),
    ...[getChapter, adjustChapter, quiz, retryQuiz, attempt, regenerate, revisit, practice, explanations, explain, retryExplanation].map(fn => () => fn(new Request("http://localhost", { method: "POST", body: "{}" }), chapterContext))];
  for (const handler of handlers) { const denied = await handler(); expect(denied.status).toBe(404); expect(await denied.json()).toEqual({ error: { code: "not_found", message: "Resource not found." } }); }
  state.headers = new Headers(); for (const handler of handlers) expect((await handler()).status).toBe(401);
  // A job runs as the owner even if another learner was the most recent caller.
  state.headers = cookie;
  db.delete(chapters).run(); vi.mocked(runAgentObject).mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [] });
  const job = db.select().from(generationJobs).where(eq(generationJobs.targetId, courseId)).get()!;
  expect(await processGenerationJob(claimGenerationJob(job.id, "isolation-worker")!, "isolation-worker")).toBe("completed");
  expect(vi.mocked(runAgentObject).mock.calls[0][2]).toContain("Owner background");
  expect(db.select().from(learnerProfile).where(eq(learnerProfile.userId, second.id)).get()?.aboutMe).toBe("Second learner");
});

const invitationRequest = (email: string) => new Request("http://localhost:3100/api/invitations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
it("lets only the configured owner invite, normalizes duplicates, and enables immediate OTP login", async () => {
  expect((await invite(invitationRequest("new@example.com"))).status).toBe(401);
  const owner = await login();
  expect((await invite(invitationRequest(" New+Beta@Example.com "))).status).toBe(200);
  expect((await invite(invitationRequest("new+beta@example.com"))).status).toBe(200);
  expect(db.select().from(invitations).all()).toEqual([expect.objectContaining({ email: "new+beta@example.com", invitedBy: owner.id })]);
  expect((await invite(invitationRequest("bad address"))).status).toBe(400);
  state.headers = new Headers(); const learner = await login("new+beta@example.com");
  expect(learner.email).toBe("new+beta@example.com");
  expect((await invite(invitationRequest("another@example.com"))).status).toBe(403);
  expect(db.select().from(invitations).all()).toHaveLength(1);
});
it("retains access after uncertain invitation delivery and safely resends", async () => {
  await login(); state.deliveryFailure = true;
  const response = await invite(invitationRequest("new@example.com")); expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: { code: "delivery_failed", retryable: true } });
  expect(db.select().from(invitations).all()).toHaveLength(1);
  state.deliveryFailure = false;
  expect((await invite(invitationRequest("new@example.com"))).status).toBe(200);
  state.headers = new Headers(); await login("new@example.com");
});
it("checks the owner's email on every invitation request and rejects cross-origin writes", async () => {
  await login();
  vi.stubEnv("INVITED_EMAILS", "owner@example.com"); vi.stubEnv("OWNER_EMAIL", "changed@example.com");
  expect((await invite(invitationRequest("new@example.com"))).status).toBe(403);
  vi.stubEnv("OWNER_EMAIL", "owner@example.com"); state.headers.set("origin", "https://evil.example");
  expect((await invite(invitationRequest("new@example.com"))).status).toBe(403);
  expect(db.select().from(invitations).all()).toHaveLength(0);
});
