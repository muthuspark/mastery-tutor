import { beforeEach, expect, it, vi } from "vitest";
const identity = vi.hoisted(() => ({ id: "owner" as string | null }));
vi.mock("@/lib/access", () => ({
  authorize: async () =>
    identity.id
      ? { user: { id: identity.id } }
      : new Response(null, { status: 401 }),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const schema = await import("@/lib/db/schema");
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "drizzle" });
  return { db };
});
import { GET } from "./api/study/today/route";
import { PUT } from "./api/study/preferences/route";
import { db } from "@/lib/db";
import { user, studyPreferences } from "@/lib/db/schema";
beforeEach(() => {
  db.delete(user).run();
  identity.id = "owner";
  const now = new Date();
  db.insert(user)
    .values(
      ["owner", "other"].map((id) => ({
        id,
        name: id,
        email: `${id}@test.local`,
        createdAt: now,
        updatedAt: now,
      })),
    )
    .run();
});
const save = (timeZone: string) =>
  PUT(
    new Request("http://localhost/api/study/preferences", {
      method: "PUT",
      body: JSON.stringify({ timeZone }),
    }),
  );
it("returns private setup state without side effects", async () => {
  const response = await GET();
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    setupRequired: true,
    dueCount: 0,
  });
  expect(db.select().from(studyPreferences).all()).toEqual([]);
});
it("saves only the authenticated user's valid time zone", async () => {
  expect((await save("invalid")).status).toBe(400);
  expect((await save("Asia/Kolkata")).status).toBe(200);
  identity.id = "other";
  expect(await (await GET()).json()).toMatchObject({
    setupRequired: true,
    timeZone: "UTC",
  });
  identity.id = "owner";
  expect(await (await GET()).json()).toMatchObject({
    setupRequired: false,
    timeZone: "Asia/Kolkata",
  });
});
it("rejects unauthenticated reads and writes", async () => {
  identity.id = null;
  expect((await GET()).status).toBe(401);
  expect((await save("UTC")).status).toBe(401);
});
