import { z } from "zod";

export const agentSchema = z.enum(["codex", "claude", "deepseek"]);
export type Agent = z.infer<typeof agentSchema>;
export const agentLabels: Record<Agent, string> = {
  codex: "Codex CLI", claude: "Claude CLI", deepseek: "DeepSeek API",
};
export type AgentStatus = { available: Agent[]; selected: Agent | null };
