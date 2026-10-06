import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { runCodexObject } from "./codex";
import { gradeSchema } from "./schemas";

describe("runCodexObject", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("validates the structured response returned by the adapter seam", async () => {
    const result = await runCodexObject(
      "grade this",
      gradeSchema,
      { timeoutMs: 1000 },
      async (args) => {
        const outputPath = args[args.indexOf("--output-last-message") + 1];
        await import("node:fs/promises").then(({ writeFile }) =>
          writeFile(outputPath, JSON.stringify({ score: 1, feedback: "Correct", missedConcept: null })),
        );
        return { exitCode: 0, stderr: "" };
      },
    );

    expect(result.score).toBe(1);
  });

  it("maps malformed structured output to a retryable Codex error", async () => {
    await expect(
      runCodexObject(
        "grade this",
        gradeSchema,
        { timeoutMs: 1000 },
        async (args) => {
          const outputPath = args[args.indexOf("--output-last-message") + 1];
          await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, "{}"));
          return { exitCode: 0, stderr: "" };
        },
      ),
    ).rejects.toMatchObject({ code: "invalid_output", retryable: true });
  });
});
