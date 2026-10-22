import { afterEach, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { runClaudeObject } from "./claude";

afterEach(() => vi.unstubAllEnvs());

it.each([undefined, 900])("uses configured timeouts while honoring explicit overrides (%s)", async (override) => {
  vi.stubEnv("CLAUDE_TIMEOUT_MS", "240000");
  const runner = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: JSON.stringify({ result: JSON.stringify({ issues: [] }) }) });
  await runClaudeObject("Review", z.object({ issues: z.array(z.string()) }), { timeoutMs: override }, runner);
  expect(runner.mock.calls[0][2]).toEqual({ timeoutMs: override ?? 240000 });
});

it("supplies the full schema to Claude and validates the result envelope", async () => {
  const runner = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: JSON.stringify({ result: JSON.stringify({ issues: [] }) }) });
  const schema = z.object({ issues: z.array(z.string()) });
  expect(await runClaudeObject("Review the material", schema, {}, runner)).toEqual({ issues: [] });
  expect(runner.mock.calls[0][0][1]).toContain(JSON.stringify(z.toJSONSchema(schema)));
});
