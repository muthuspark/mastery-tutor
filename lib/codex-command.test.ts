import { describe, expect, it } from "vitest";
import { codexArgs } from "./codex-command";

describe("codexArgs", () => {
  it("uses fixed non-interactive read-only arguments", () => {
    expect(
      codexArgs({
        model: "gpt-test",
        schemaPath: "/tmp/schema.json",
        outputPath: "/tmp/output.json",
        timeoutMs: 1000,
      }),
    ).toEqual([
      "exec",
      "--skip-git-repo-check",
      "--ephemeral",
      "--sandbox",
      "read-only",
      "--output-schema",
      "/tmp/schema.json",
      "--output-last-message",
      "/tmp/output.json",
      "--model",
      "gpt-test",
      "-",
    ]);
  });
});
