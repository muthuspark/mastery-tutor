import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/codex", () => ({ modelFor: () => undefined, runCodexObject: vi.fn() }));

import { POST as createCourse } from "@/app/api/courses/route";
import { GET as getCourse } from "@/app/api/courses/[id]/route";
import { GET as exportCourse } from "@/app/api/courses/[id]/export/route";
import { POST as createAttempt } from "@/app/api/chapters/[id]/attempts/route";

describe("API contracts", () => {
  it("rejects an empty course topic without invoking Codex", async () => {
    const response = await createCourse(new Request("http://localhost/api/courses", { method: "POST", body: JSON.stringify({ topic: " " }) }));
    expect(response.status).toBe(400);
  });

  it("returns 404 for missing course resources", async () => {
    const context = { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) };
    expect((await getCourse(new Request("http://localhost"), context)).status).toBe(404);
    expect((await exportCourse(new Request("http://localhost"), context)).status).toBe(404);
  });

  it("rejects malformed attempt payloads before grading", async () => {
    const response = await createAttempt(new Request("http://localhost", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "00000000-0000-4000-8000-000000000000" }) });
    expect(response.status).toBe(400);
  });
});
