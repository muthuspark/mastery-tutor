import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  execFile: vi.fn((_cmd, _args, callback) => callback(new Error("absent"), "", "")),
}));
vi.mock("@/lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/lib/db/schema");
  const db = drizzle(new Database(":memory:"), { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
import { db } from "@/lib/db";
import { learnerProfile } from "@/lib/db/schema";
import { getProfile, saveProfile } from "@/lib/profile";
import { PUT } from "./api/profile/route";
import { GET, POST } from "./api/agents/route";
beforeEach(() => { db.delete(learnerProfile).run(); vi.stubEnv("DEEPSEEK_API_KEY", "sentinel-secret"); vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("discovers DeepSeek alone and saves its profile preference without a network call or secret exposure", async () => {
  expect(await (await GET()).json()).toEqual({ available: ["deepseek"], selected: "deepseek" });
  const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ agent: "deepseek" }) }));
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ selected: "deepseek" });
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(getProfile().learningAgent).toBe("deepseek");
  expect(JSON.stringify(getProfile())).not.toContain("sentinel-secret");
  expect(fetch).not.toHaveBeenCalled();
});
it.each([["unknown", 400], ["claude", 503], ["codex", 503]])("rejects unsupported/unavailable %s", async (agent, status) => {
  expect((await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ agent }) }))).status).toBe(status);
});
it("returns no configured provider without the key", async () => {
  vi.stubEnv("DEEPSEEK_API_KEY", " ");
  expect(await (await GET()).json()).toEqual({ available: [], selected: null });
  expect((await POST(new Request("http://localhost", { method: "POST", body: '{"agent":"deepseek"}' }))).status).toBe(503);
});

it("shows a saved unavailable agent rather than a substitute", async () => {
  saveProfile("Background", "claude");
  expect(await (await GET()).json()).toEqual({ available: ["deepseek"], selected: "claude" });
});

it("rejects unavailable profile choices atomically and keeps both saved fields", async () => {
  saveProfile("Keep background", "deepseek");
  const response = await PUT(new Request("http://localhost/api/profile", { method: "PUT", body: JSON.stringify({ aboutMe: "Unsaved", learningAgent: "claude" }) }));
  expect(response.status).toBe(503);
  expect(getProfile()).toEqual({ aboutMe: "Keep background", learningAgent: "deepseek" });
});
