import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runClaudeObject } from "./claude";
import { modelFor, runCodexObject, type CodexTask } from "./codex";
import { CodexError } from "./codex-errors";
import { z } from "zod";

const execFileAsync = promisify(execFile);
export const AGENT_COOKIE = "mastery-tutor-agent";
export const agentSchema = z.enum(["codex", "claude"]);
export type Agent = z.infer<typeof agentSchema>;

async function commandAvailable(command: Agent) {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

export async function availableAgents(): Promise<Agent[]> {
  const [codex, claude] = await Promise.all([commandAvailable("codex"), commandAvailable("claude")]);
  return [codex ? "codex" : null, claude ? "claude" : null].filter((agent): agent is Agent => agent !== null);
}

function cookieAgent(request: Request) {
  const value = request.headers.get("cookie")?.match(new RegExp(`(?:^|;\\s*)${AGENT_COOKIE}=([^;]+)`))?.[1];
  return agentSchema.safeParse(value).success ? value as Agent : undefined;
}

export async function agentForRequest(request: Request, requested?: Agent) {
  const available = await availableAgents();
  const preferred = requested ?? cookieAgent(request) ?? (available.includes("codex") ? "codex" : available[0]);
  return preferred && available.includes(preferred) ? preferred : available[0];
}

export async function runAgentObject<T>(
  agent: Agent,
  task: CodexTask,
  prompt: string,
  schema: z.ZodType<T>,
) {
  const model = modelFor(task, agent);
  if (agent === "claude") return runClaudeObject(prompt, schema, { model });
  return runCodexObject(prompt, schema, { model });
}

export function noAgentError() {
  return new CodexError("not_found", "Install either the Codex or Claude CLI to generate course content.", false);
}
