import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { eq } from "drizzle-orm";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => ({ ...await importOriginal<typeof import("next/server")>(), after: vi.fn() }));
vi.mock("@/lib/db", async () => {
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
vi.mock("@/lib/agent", () => ({ runAgentObject: vi.fn(), agentForRequest: vi.fn(async () => "codex"), noAgentError: vi.fn() }));

import { POST } from "@/app/api/chapters/[id]/socratic/route";
import { runAgentObject } from "@/lib/agent";
import { db } from "@/lib/db";
import { attempts, chapters, courses, socraticSessions } from "@/lib/db/schema";
import type { SocraticRequest, SocraticSessionView } from "@/lib/socratic-contracts";
import { socraticQuestionSchema } from "@/lib/socratic-contracts";
import { advanceSocratic, prefetchSocratic } from "@/lib/socratic";

const question = {
  setup: "A book has many pages. An index lists where each topic appears.",
  prompt: "Why can an index speed up a search?",
  options: ["Locate records without scanning every row", "Speed up the processor", "Duplicate all records"],
  correctIndex: 0,
  feedback: ["You identified how an index reduces the search work.", "Consider the work the search must do, rather than processor speed.", "Consider how to locate a record, rather than copying it."],
  hint: "Think about the number of rows you must check.",
};

beforeEach(() => {
  db.delete(courses).run();
  vi.mocked(runAgentObject).mockReset();
  vi.mocked(runAgentObject).mockImplementation(async (_agent, _task, prompt) => prompt.includes("The practice session is finished")
    ? { summary: "An index reduces the records a search must examine. Review the trade-off of maintaining it." }
    : { ...question, prompt: `${question.prompt} Step ${vi.mocked(runAgentObject).mock.calls.length}` });
  const now = new Date();
  db.insert(courses).values({ id: "course", topic: "Databases", createdAt: now }).run();
  db.insert(chapters).values({ id: "chapter", courseId: "course", idx: 0, title: "Indexes", objectives: ["Explain search cost"], prerequisites: [], content: "Indexes help find records without scanning all rows. Maintaining them adds write cost.", status: "open", contentGenerationStatus: "ready", createdAt: now }).run();
});

function post(body: unknown, id = "chapter") {
  return POST(new Request(`http://localhost/api/chapters/${id}/socratic`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}
async function start() {
  const response = await post({ action: "start", version: 1 });
  expect(response.status).toBe(200);
  return await response.json() as SocraticSessionView;
}
function answerInput(session: SocraticSessionView, correct = true, usedHint = false): SocraticRequest {
  return { action: "answer", version: 1, sessionId: session.id, questionId: session.question!.id, choiceIndex: session.question!.options.indexOf(question.options[correct ? 0 : 1]), usedHint };
}
async function answer(session: SocraticSessionView, correct = true, usedHint = false) {
  const response = await post(answerInput(session, correct, usedHint));
  expect(response.status).toBe(200);
  return await response.json() as SocraticSessionView;
}

it("finishes after three unassisted correct choices, resumes saved progress, and keeps quiz evidence unchanged", async () => {
  const before = db.select().from(chapters).all();
  let session = await start();
  expect(session.question).not.toHaveProperty("correctIndex");
  expect(session.question).not.toHaveProperty("feedback");
  session = await answer(session);
  const callCount = vi.mocked(runAgentObject).mock.calls.length;
  expect(await start()).toEqual(session);
  expect(runAgentObject).toHaveBeenCalledTimes(callCount);
  session = await answer(session);
  expect(session.question).not.toBeNull();
  session = await answer(session);
  expect(session.question).toBeNull();
  expect(session.turns).toHaveLength(3);
  expect(session.summary).toContain("An index reduces");
  expect(await start()).toEqual(session);
  expect(db.select().from(attempts).all()).toEqual([]);
  expect(db.select().from(chapters).all()).toEqual(before);
});

it("follows the selected misconception, uses hints, and always stops at five", async () => {
  let session = await start();
  session = await answer(session, false);
  expect(session.turns[0]).toMatchObject({ correct: false, response: question.options[1], feedback: question.feedback[1] });
  const followUp = vi.mocked(runAgentObject).mock.calls.at(-1)![2];
  expect(followUp).toContain("Offer a simpler scaffold");
  expect(followUp).toContain(JSON.stringify(question.options[1]));
  session = await answer(session, true, true);
  session = await answer(session);
  expect(session.summary).toBeNull();
  session = await answer(session, false);
  session = await answer(session);
  expect(session.turns).toHaveLength(5);
  expect(session.question).toBeNull();
  expect(session.summary).toBeTruthy();
});

it("can finish at four after a mistake followed by three unassisted correct answers", async () => {
  let session = await answer(await start(), false);
  for (let index = 0; index < 3; index++) session = await answer(session);
  expect(session.turns).toHaveLength(4);
  expect(session.summary).toBeTruthy();
});

it("treats uncertainty as a request for guidance and retries lost responses idempotently", async () => {
  const session = await start();
  const input = { ...answerInput(session), choiceIndex: null };
  const response = await post(input);
  const next = await response.json();
  expect(next.turns[0]).toMatchObject({ correct: false, response: "I'm not sure", feedback: expect.stringContaining(question.hint) });
  const count = vi.mocked(runAgentObject).mock.calls.length;
  expect(await (await post(input)).json()).toEqual(next);
  expect(runAgentObject).toHaveBeenCalledTimes(count);
});

it("keeps progress and the selected question on a generation failure so the answer can be retried", async () => {
  const session = await start();
  vi.mocked(runAgentObject).mockRejectedValueOnce(new Error("Generation unavailable"));
  expect((await post(answerInput(session))).status).toBe(503);
  expect(await start()).toEqual(session);
  expect((await answer(session)).turns).toHaveLength(1);
});

it("rejects locked, missing, unready, stale, and malformed requests before generation", async () => {
  expect((await post({ action: "start", version: 1 }, "missing")).status).toBe(404);
  db.update(chapters).set({ status: "locked" }).where(eq(chapters.id, "chapter")).run();
  expect((await post({ action: "start", version: 1 })).status).toBe(403);
  db.update(chapters).set({ status: "open", contentGenerationStatus: "generating" }).where(eq(chapters.id, "chapter")).run();
  expect((await post({ action: "start", version: 1 })).status).toBe(409);
  expect((await post({ action: "start", version: 2 })).status).toBe(409);
  expect((await post({ action: "answer", version: 1, choiceIndex: 8 })).status).toBe(400);
  expect(runAgentObject).not.toHaveBeenCalled();
});

it("starts a fresh session after regeneration and rejects an answer from the old lesson", async () => {
  const old = await start();
  db.update(chapters).set({ contentGenerationVersion: 2 }).where(eq(chapters.id, "chapter")).run();
  expect((await post(answerInput(old))).status).toBe(409);
  const fresh = await (await post({ action: "start", version: 2 })).json();
  expect(fresh.id).not.toBe(old.id);
  expect(fresh.turns).toHaveLength(0);
});

it("rejects restart requests and preserves the saved conversation", async () => {
  const old = await start();
  const response = await post({ action: "restart", version: 1, sessionId: old.id });
  expect(response.status).toBe(400);
  expect(await start()).toEqual(old);
  expect(runAgentObject).toHaveBeenCalledTimes(1);
});

it("does not overwrite progress when two different answers arrive together", async () => {
  const session = await start();
  const responses = await Promise.all([post(answerInput(session)), post(answerInput(session, false))]);
  const views = await Promise.all(responses.map((response) => response.json()));
  expect(views[0]).toEqual(views[1]);
  expect((await start()).turns).toHaveLength(1);
  expect(db.select().from(socraticSessions).all()).toHaveLength(1);
});

it("rejects malformed generated question structures", () => {
  expect(socraticQuestionSchema.safeParse({ ...question, correctIndex: 3 }).success).toBe(false);
  expect(socraticQuestionSchema.safeParse({ ...question, options: ["Same", " Same ", "Other"] }).success).toBe(false);
  expect(socraticQuestionSchema.safeParse({ ...question, feedback: ["Only one"] }).success).toBe(false);
});

it("prepares a next step without recording an answer and reuses it immediately for a matching choice", async () => {
  const session = await start();
  const stored = db.select().from(socraticSessions).all();
  await prefetchSocratic("chapter", session.id, "codex");
  expect(db.select().from(socraticSessions).all()).toEqual(stored);
  expect(runAgentObject).toHaveBeenCalledTimes(2);
  const next = await answer(session);
  expect(next.turns).toHaveLength(1);
  expect(next.turns[0].correct).toBe(true);
  expect(runAgentObject).toHaveBeenCalledTimes(2);
});

it.each(["wrong", "hinted", "unsure"])("generates an actual adaptive response when a prepared answer differs (%s)", async (kind) => {
  const session = await start();
  await prefetchSocratic("chapter", session.id, "codex");
  const input = answerInput(session, kind !== "wrong", kind === "hinted");
  if (input.action !== "answer") throw new Error("Expected answer input");
  if (kind === "unsure") input.choiceIndex = null;
  const next = await (await post(input)).json();
  expect(next.turns[0]).toMatchObject({ correct: kind === "hinted", usedHint: kind === "hinted" });
  expect(runAgentObject).toHaveBeenCalledTimes(3);
});

it("coalesces repeated preparations and an answer arriving while preparation is running", async () => {
  const session = await start();
  let finish!: (value: typeof question) => void;
  vi.mocked(runAgentObject).mockReturnValueOnce(new Promise<typeof question>((resolve) => { finish = resolve; }));
  const first = prefetchSocratic("chapter", session.id, "codex");
  const duplicate = prefetchSocratic("chapter", session.id, "codex");
  const response = post(answerInput(session));
  await vi.waitFor(() => expect(runAgentObject).toHaveBeenCalledTimes(2));
  finish(question);
  await Promise.all([first, duplicate]);
  expect((await (await response).json()).turns).toHaveLength(1);
  expect(runAgentObject).toHaveBeenCalledTimes(2);
});

it("recovers from speculative failure without losing an answer or saved progress", async () => {
  const session = await start();
  vi.mocked(runAgentObject).mockRejectedValueOnce(new Error("Temporary failure"));
  await prefetchSocratic("chapter", session.id, "codex");
  expect(await start()).toEqual(session);
  expect((await answer(session)).turns).toHaveLength(1);
});

it("does not silently start a second model call when an awaited preparation fails", async () => {
  const session = await start();
  let fail!: (error: Error) => void;
  vi.mocked(runAgentObject).mockReturnValueOnce(new Promise((_resolve, reject) => { fail = reject; }));
  const pending = prefetchSocratic("chapter", session.id, "codex");
  const outcome = advanceSocratic("chapter", answerInput(session), "codex").then(() => null, (error: unknown) => error);
  const timeout = new Error("Timed out");
  fail(timeout);
  await pending;
  expect(await outcome).toBe(timeout);
  expect(await start()).toEqual(session);
  expect(runAgentObject).toHaveBeenCalledTimes(2);
});

it("prepares the final explanation without ending the session until the answer is submitted", async () => {
  let session = await answer(await start());
  session = await answer(session);
  await prefetchSocratic("chapter", session.id, "codex");
  const count = vi.mocked(runAgentObject).mock.calls.length;
  expect((await start()).summary).toBeNull();
  session = await answer(session);
  expect(session.summary).toBeTruthy();
  expect(runAgentObject).toHaveBeenCalledTimes(count);
});
