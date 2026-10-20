import { expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { runClaudeObject } from "./claude";

it("supplies the full schema to Claude and validates the result envelope", async () => {
  const runner = vi.fn().mockResolvedValue({ exitCode: 0, stderr: "", stdout: JSON.stringify({ result: JSON.stringify({ issues: [] }) }) });
  const schema = z.object({ issues: z.array(z.string()) });
  expect(await runClaudeObject("Review the material", schema, {}, runner)).toEqual({ issues: [] });
  expect(runner.mock.calls[0][0][1]).toContain(JSON.stringify(z.toJSONSchema(schema)));
});
