import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { commands } = vi.hoisted(() => ({ commands: new Set<string>() }));
vi.mock("node:child_process", async (original) => ({
  ...await original<typeof import("node:child_process")>(),
  execFile: vi.fn((_command, args, callback) => callback(commands.has(args[0]) ? null : new Error("absent"), "", "")),
}));
const { preference } = vi.hoisted(() => ({ preference: { learningAgent: null as "codex" | "claude" | "deepseek" | null } }));
vi.mock("./profile", () => ({ getProfile: () => ({ aboutMe: "", ...preference }) }));
import { availableAgents } from "./agent";
import { modelFor } from "./codex";

beforeEach(() => { commands.clear(); preference.learningAgent = null; vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it.each(Array.from({ length: 8 }, (_, bits) => [bits]))("discovers configured providers without network calls (%i)", async (bits) => {
  if (bits & 1) commands.add("codex");
  if (bits & 2) commands.add("claude");
  vi.stubEnv("DEEPSEEK_API_KEY", bits & 4 ? " sentinel-key " : "  ");
  expect(await availableAgents()).toEqual([
    ...(bits & 1 ? ["codex"] : []), ...(bits & 2 ? ["claude"] : []), ...(bits & 4 ? ["deepseek"] : []),
  ]);
  expect(fetch).not.toHaveBeenCalled();
});

it("resolves trimmed task, chapter fallback, global and default DeepSeek models", () => {
  for (const key of ["DEEPSEEK_MODEL", "DEEPSEEK_MODEL_CHAPTER", "DEEPSEEK_MODEL_SOCRATIC"]) vi.stubEnv(key, "  ");
  expect(modelFor("socratic", "deepseek")).toBe("deepseek-flash");
  vi.stubEnv("DEEPSEEK_MODEL", " global ");
  expect(modelFor("socratic", "deepseek")).toBe("global");
  vi.stubEnv("DEEPSEEK_MODEL_CHAPTER", " chapter ");
  expect(modelFor("socratic", "deepseek")).toBe("chapter");
  expect(modelFor("chapter", "deepseek")).toBe("chapter");
  vi.stubEnv("DEEPSEEK_MODEL_SOCRATIC", " interactive ");
  expect(modelFor("socratic", "deepseek")).toBe("interactive");
  expect(modelFor("review", "deepseek")).toBe("global");
  vi.stubEnv("DEEPSEEK_MODEL_REVIEW", " custom-model ");
  expect(modelFor("review", "deepseek")).toBe("custom-model");
});

it("uses the profile across browsers, ignores old cookies, and never replaces an unavailable saved agent", async () => {
  const { agentForRequest } = await import("./agent");
  commands.add("codex");
  vi.stubEnv("DEEPSEEK_API_KEY", "key");
  const request = new Request("http://localhost", { headers: { cookie: "mastery-tutor-agent=claude" } });
  expect(await agentForRequest(request)).toBe("codex");
  preference.learningAgent = "deepseek";
  expect(await agentForRequest(request)).toBe("deepseek");
  expect(await agentForRequest(new Request("http://localhost"), "codex")).toBe("deepseek");
  vi.stubEnv("DEEPSEEK_API_KEY", "");
  await expect(agentForRequest(request)).rejects.toMatchObject({ code: "not_found", retryable: false });
});

it.each(["syllabus", "chapter", "quiz", "grading", "review", "socratic"] as const)("dispatches %s to DeepSeek with its output budget", async (task) => {
  const { runAgentObject } = await import("./agent");
  const { execFile } = await import("node:child_process");
  const { z } = await import("zod");
  vi.mocked(execFile).mockClear();
  vi.stubEnv("DEEPSEEK_API_KEY", "key");
  vi.stubEnv("DEEPSEEK_MODEL", "custom");
  vi.mocked(fetch).mockResolvedValue(Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"answer":"ok"}' } }] }));
  expect(await runAgentObject("deepseek", task, "teach", z.object({ answer: z.string() }))).toEqual({ answer: "ok" });
  expect(JSON.parse(vi.mocked(fetch).mock.calls[0][1]!.body as string)).toMatchObject({ model: "custom", max_tokens: task === "socratic" ? 4096 : 16384 });
  expect(execFile).not.toHaveBeenCalled();
});
