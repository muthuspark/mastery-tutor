import "server-only";

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { z } from "zod";
import { CodexError } from "./codex-errors";

type ClaudeOptions = { model?: string; timeoutMs?: number };

type ClaudeRunner = (
  args: string[],
  prompt: string,
  options: { timeoutMs: number },
) => Promise<{ exitCode: number | null; stdout: string; stderr: string }>;

const defaultRunner: ClaudeRunner = (args, prompt, options) =>
  new Promise((resolve, reject) => {
    const child = spawn("claude", args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new CodexError("timeout", "Claude CLI timed out.", true));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => { stdout = `${stdout}${chunk.toString()}`.slice(-100_000); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = `${stderr}${chunk.toString()}`.slice(-4000); });
    child.once("error", reject);
    child.once("close", (exitCode) => {
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr });
    });
    child.stdin.end(prompt);
  });

export async function runClaudeObject<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: ClaudeOptions = {},
  runner: ClaudeRunner = defaultRunner,
): Promise<T> {
  const workDir = await mkdtemp(path.join(tmpdir(), "mastery-tutor-claude-"));
  const timeoutMs = options.timeoutMs ?? 60_000;

  try {
    const result = await runner(
      ["-p", `${prompt}\n\nReturn only a valid JSON object matching the requested structure.`, "--output-format", "json", ...(options.model ? ["--model", options.model] : [])],
      "",
      { timeoutMs },
    );
    if (result.exitCode !== 0) throw new CodexError("failed", "Claude CLI returned a non-zero exit code.", true);
    const envelope = JSON.parse(result.stdout) as { result?: string } | unknown;
    const raw = typeof envelope === "object" && envelope !== null && "result" in envelope
      ? (envelope as { result: unknown }).result
      : envelope;
    const output = typeof raw === "string" ? JSON.parse(raw) : raw;
    return schema.parse(output);
  } catch (error) {
    if (error instanceof CodexError) throw error;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new CodexError("invalid_output", "Claude returned invalid structured output.", true);
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
