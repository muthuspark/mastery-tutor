import { afterEach, expect, it, vi } from "vitest";
import { agentTimeoutMs } from "./agent-timeout";

afterEach(() => vi.unstubAllEnvs());

it("gives each agent three minutes by default", () => {
  vi.stubEnv("CODEX_TIMEOUT_MS", undefined);
  vi.stubEnv("CLAUDE_TIMEOUT_MS", undefined);
  expect(agentTimeoutMs("codex")).toBe(180_000);
  expect(agentTimeoutMs("claude")).toBe(180_000);
});

it("keeps independently configured limits for each CLI", () => {
  vi.stubEnv("CODEX_TIMEOUT_MS", "300000");
  vi.stubEnv("CLAUDE_TIMEOUT_MS", "240000");
  expect(agentTimeoutMs("codex")).toBe(300_000);
  expect(agentTimeoutMs("claude")).toBe(240_000);
});

it.each(["", "0", "-1", "1.5", "invalid", "Infinity", "2147483648"])("uses a safe default for invalid timeout %s", (value) => {
  vi.stubEnv("CODEX_TIMEOUT_MS", value);
  vi.stubEnv("CLAUDE_TIMEOUT_MS", value);
  expect(agentTimeoutMs("codex")).toBe(180_000);
  expect(agentTimeoutMs("claude")).toBe(180_000);
});
