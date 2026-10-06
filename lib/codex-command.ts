export type CodexRequest = {
  model?: string;
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
  args.push("-");
  return args;
}
