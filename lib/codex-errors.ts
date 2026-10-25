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
  if (error instanceof CodexError) return new CodexError(error.code,
    error.code === "not_found" ? "The tutor is temporarily unavailable. Please try again shortly." : error.code === "timeout" ? "The tutor is taking longer than expected. Please try again." : "The tutor could not prepare this material. Please try again shortly.", error.retryable);

  const message = error instanceof Error ? error.message : String(error);
  if (/enoent|not found/i.test(message)) {
    return new CodexError("not_found", "The tutor is temporarily unavailable. Please try again shortly.", false);
  }
  if (/timed out|timeout|etimedout/i.test(message)) {
    return new CodexError("timeout", "The tutor is taking longer than expected. Please try again.", true);
  }
  return new CodexError("failed", "The tutor could not prepare this material. Please try again shortly.", true);
}
