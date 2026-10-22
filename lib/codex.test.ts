import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { modelFor, runCodexObject } from "./codex";
import { gradeSchema } from "./schemas";

describe("runCodexObject", () => {
  beforeEach(() => vi.restoreAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("preserves chapter model preferences unless a dedicated interactive model is configured", () => {
    vi.stubEnv("CODEX_MODEL", "global-model");
    vi.stubEnv("CODEX_MODEL_CHAPTER", "chapter-model");
    vi.stubEnv("CODEX_MODEL_SOCRATIC", undefined);
    expect(modelFor("socratic")).toBe("chapter-model");
    vi.stubEnv("CODEX_MODEL_SOCRATIC", "interactive-model");
    expect(modelFor("socratic")).toBe("interactive-model");
    expect(modelFor("chapter")).toBe("chapter-model");
  });

  it.each([undefined, 900])("uses configured timeouts while honoring explicit overrides (%s)", async (override) => {
    vi.stubEnv("CODEX_TIMEOUT_MS", "240000");
    const runner = vi.fn(async (args: string[]) => {
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, JSON.stringify({ score: 1, feedback: "Correct", missedConcept: null })));
      return { exitCode: 0, stderr: "" };
    });
    await runCodexObject("grade this", gradeSchema, { timeoutMs: override }, runner);
    expect(runner).toHaveBeenCalledWith(expect.any(Array), "grade this", { timeoutMs: override ?? 240000 });
  });

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

  it("runs interactive educational requests outside the repository with their own reasoning effort", async () => {
    let workingDirectory = "";
    await runCodexObject("grade this", gradeSchema, { isolated: true, reasoningEffort: "low" }, async (args, _prompt, options) => {
      workingDirectory = options.cwd ?? "";
      expect(workingDirectory).not.toBe(process.cwd());
      expect(args).toContain('model_reasoning_effort="low"');
      const outputPath = args[args.indexOf("--output-last-message") + 1];
      expect(outputPath.startsWith(workingDirectory)).toBe(true);
      await import("node:fs/promises").then(({ writeFile }) => writeFile(outputPath, JSON.stringify({ score: 1, feedback: "Correct", missedConcept: null })));
      return { exitCode: 0, stderr: "" };
    });
    await expect(import("node:fs/promises").then(({ access }) => access(workingDirectory))).rejects.toBeDefined();
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
    ).rejects.toMatchObject({ code: "invalid_output", retryable: true, message: expect.stringContaining("score:") });
  });
});
