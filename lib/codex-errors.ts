export type CodexErrorCode = "not_found" | "timeout" | "failed" | "invalid_output";

export class CodexError extends Error {
  constructor(
    public readonly code: CodexErrorCode,
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "CodexError";
  }
}

export function classifyCodexFailure(error: unknown): CodexError {
  if (error instanceof CodexError) return error;

  const message = error instanceof Error ? error.message : String(error);
  if (/enoent|not found/i.test(message)) {
    return new CodexError("not_found", "Codex CLI is not installed or unavailable.", false);
  }
  if (/timed out|timeout|etimedout/i.test(message)) {
    return new CodexError("timeout", "Codex CLI timed out.", true);
  }
  return new CodexError("failed", "Codex CLI failed to produce a response.", true);
}
