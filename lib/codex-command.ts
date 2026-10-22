export type CodexRequest = {
  model?: string;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh";
  schemaPath: string;
  outputPath: string;
  timeoutMs: number;
};

export function codexArgs(request: CodexRequest) {
  const args = [
    "exec",
    "--skip-git-repo-check",
    "--ephemeral",
    "--sandbox",
    "read-only",
    "--output-schema",
    request.schemaPath,
    "--output-last-message",
    request.outputPath,
  ];

  if (request.model) args.push("--model", request.model);
  if (request.reasoningEffort) args.push("--config", `model_reasoning_effort=${JSON.stringify(request.reasoningEffort)}`);
  args.push("-");
  return args;
}
