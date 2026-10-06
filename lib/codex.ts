import "server-only";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { codexArgs } from "./codex-command";
import { classifyCodexFailure, CodexError } from "./codex-errors";

type RunOptions = {
  model?: string;
  timeoutMs?: number;
};

export type CodexTask = "syllabus" | "chapter" | "quiz" | "grading";

export function modelFor(task: CodexTask) {
  const configured = process.env[`CODEX_MODEL_${task.toUpperCase()}`];
  return configured || process.env.CODEX_MODEL;
}

type SpawnResult = { exitCode: number | null; stderr: string };

export type CodexRunner = (
  args: string[],
  prompt: string,
  options: { timeoutMs: number },
) => Promise<SpawnResult>;

const defaultRunner: CodexRunner = (args, prompt, options) =>
  new Promise((resolve, reject) => {
    const child = spawn("codex", args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new CodexError("timeout", "Codex CLI timed out.", true));
    }, options.timeoutMs);

    child.stderr.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString()}`.slice(-4000);
    });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stderr });
    });
    child.stdin.end(prompt);
  });

export async function runCodexObject<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: RunOptions = {},
  runner: CodexRunner = defaultRunner,
): Promise<T> {
  const workDir = await mkdtemp(path.join(tmpdir(), "mastery-tutor-codex-"));
  const schemaPath = path.join(workDir, "schema.json");
  const outputPath = path.join(workDir, "answer.json");
  const timeoutMs = options.timeoutMs ?? 60_000;

  try {
    await writeFile(schemaPath, JSON.stringify(z.toJSONSchema(schema), null, 2));
    const result = await runner(
      codexArgs({
        model: options.model,
        schemaPath,
        outputPath,
        timeoutMs,
      }),
      prompt,
      { timeoutMs },
    );
    if (result.exitCode !== 0) {
      throw new CodexError("failed", "Codex CLI returned a non-zero exit code.", true);
    }
    const output = JSON.parse(await readFile(outputPath, "utf8")) as unknown;
    return schema.parse(output);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new CodexError("invalid_output", "Codex returned invalid structured output.", true);
    }
    throw classifyCodexFailure(error);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
