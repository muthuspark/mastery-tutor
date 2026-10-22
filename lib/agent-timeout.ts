export const DEFAULT_AGENT_TIMEOUT_MS = 180_000;

export function agentTimeoutMs(agent: "codex" | "claude" | "deepseek") {
  const configured = Number(process.env[`${agent.toUpperCase()}_TIMEOUT_MS`]);
  // Node timers overflow above a signed 32-bit integer and then fire immediately.
  return Number.isSafeInteger(configured) && configured > 0 && configured <= 2_147_483_647
    ? configured
    : DEFAULT_AGENT_TIMEOUT_MS;
}
