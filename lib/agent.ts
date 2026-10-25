import "server-only";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runClaudeObject } from "./claude";
import { runDeepSeekObject } from "./deepseek";
import { modelFor, runCodexObject, type CodexTask } from "./codex";
import { CodexError } from "./codex-errors";
import { z } from "zod";

const execFileAsync = promisify(execFile);
export { agentSchema, type Agent } from "./agent-contracts";
import { type Agent } from "./agent-contracts";


async function commandAvailable(command: "codex" | "claude") {
  try {
    await execFileAsync("which", [command]);
    return true;
  } catch {
    return false;
  }
}

export async function availableAgents(): Promise<Agent[]> {
  const [codex, claude] = await Promise.all([commandAvailable("codex"), commandAvailable("claude")]);
  return [codex ? "codex" : null, claude ? "claude" : null, process.env.DEEPSEEK_API_KEY?.trim() ? "deepseek" : null].filter((agent): agent is Agent => agent !== null);
}

export async function agentForRequest(_request: Request, _requested?: Agent) {
  void _request; void _requested;
  const preferred = process.env.AI_PROVIDER as Agent | undefined;
  if (!preferred || !(await availableAgents()).includes(preferred)) throw noAgentError();
  return preferred;
}

export async function runAgentObject<T>(
  agent: Agent,
  task: CodexTask,
  prompt: string,
  schema: z.ZodType<T>,
) {
  const model = modelFor(task, agent);
  if (agent === "deepseek") return runDeepSeekObject(prompt, schema, { model, maxTokens: task === "socratic" ? 4096 : 16384 });
  if (agent === "claude") return runClaudeObject(prompt, schema, { model, ...(task === "socratic" ? { isolated: true } : {}) });
  return runCodexObject(prompt, schema, { model, ...(task === "socratic" ? { reasoningEffort: "low", isolated: true } as const : {}) });
}

export function noAgentError() {
  return new CodexError("not_found", "The tutor is temporarily unavailable. Please try again shortly.", true);
}
