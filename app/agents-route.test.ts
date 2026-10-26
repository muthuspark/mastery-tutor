import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/access", () => ({ authorize: async () => ({ user: { id: "test-user" } }) }));
import { GET, POST } from "./api/agents/route";
it("retires learner provider selection", async () => {
  expect((await GET()).status).toBe(410);
  expect((await POST()).status).toBe(410);
});
