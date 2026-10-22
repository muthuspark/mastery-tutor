import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { z } from "zod";
vi.mock("server-only", () => ({}));
import { runDeepSeekObject } from "./deepseek";

const schema = z.object({ answer: z.string().min(1) });
const envelope = (content: unknown = '{"answer":"ok"}', reason: unknown = "stop") => ({ choices: [{ finish_reason: reason, message: { content, reasoning_content: "never use this" } }] });
const key = "sentinel-deepseek-secret";
const mockFetch = vi.fn<typeof fetch>();
beforeEach(() => { vi.useFakeTimers(); vi.stubEnv("DEEPSEEK_API_KEY", ` ${key} `); vi.stubGlobal("fetch", mockFetch); mockFetch.mockReset(); });
afterEach(() => { expect(vi.getTimerCount()).toBe(0); vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("authenticates on the server and returns only schema-validated content", async () => {
  mockFetch.mockResolvedValue(Response.json(envelope()));
  expect(await runDeepSeekObject("teach", schema, { model: "custom", maxTokens: 4096 })).toEqual({ answer: "ok" });
  const [url, init] = mockFetch.mock.calls[0];
  expect(url).toBe("https://api.deepseek.com/chat/completions");
  expect(init).toMatchObject({ method: "POST", redirect: "manual", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" } });
  const body = JSON.parse(init!.body as string);
  expect(body).toMatchObject({ model: "custom", max_tokens: 4096, stream: false, response_format: { type: "json_object" }, thinking: { type: "disabled" } });
  expect(body.messages[0].content).toContain(JSON.stringify(z.toJSONSchema(schema)));
  expect(body.messages[1]).toEqual({ role: "user", content: "teach" });
  expect(JSON.stringify(body)).not.toContain(key);
});

it.each([undefined, "", "  "])("rejects missing configuration without a request (%s)", async (value) => {
  vi.stubEnv("DEEPSEEK_API_KEY", value);
  await expect(runDeepSeekObject("teach", schema)).rejects.toMatchObject({ code: "not_found", retryable: false });
  expect(mockFetch).not.toHaveBeenCalled();
});

it.each([
  [301, false], [302, false], [307, false], [400, false], [401, false], [402, false], [403, false], [404, false], [408, true], [422, false], [429, true], [500, true], [503, true],
])("classifies HTTP %i without reading or leaking hostile response text", async (status, retryable) => {
  const log = vi.spyOn(console, "info");
  mockFetch.mockResolvedValue(new Response(`echo ${key}`, { status }));
  const error = await runDeepSeekObject("teach", schema).catch((error: unknown) => error);
  expect(error).toMatchObject({ code: "failed", retryable });
  expect(String(error)).toContain("DeepSeek");
  expect(String(error)).not.toContain(key);
  expect(log).not.toHaveBeenCalled();
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each([
  {}, { choices: [] }, envelope(null), envelope(""), envelope("  "), envelope("no JSON"), envelope('{"answer":3}'), envelope('{"answer":""}'),
  envelope(undefined, "length"), envelope(undefined, "content_filter"), envelope(undefined, null), { choices: [{ message: { content: '{"answer":"ok"}' } }] },
])("rejects invalid completion %#", async (body) => {
  mockFetch.mockResolvedValue(Response.json(body));
  await expect(runDeepSeekObject("teach", schema)).rejects.toMatchObject({ code: "invalid_output", retryable: true });
});

it("classifies malformed envelope JSON", async () => {
  mockFetch.mockResolvedValue(new Response("invalid JSON"));
  await expect(runDeepSeekObject("teach", schema)).rejects.toMatchObject({ code: "invalid_output" });
});

it("sanitizes network errors and does not retry", async () => {
  mockFetch.mockRejectedValue(new Error(key));
  await expect(runDeepSeekObject("teach", schema)).rejects.toMatchObject({ code: "failed", retryable: true, message: "Could not reach DeepSeek API. Try again." });
  expect(mockFetch).toHaveBeenCalledTimes(1);
});

it.each([false, true])("aborts the full call, including a stalled body (%s)", async (bodyStalled) => {
  mockFetch.mockImplementation(async (_url, init) => {
    if (!bodyStalled) return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    });
    return new Response(new ReadableStream({ start(stream) {
      init!.signal!.addEventListener("abort", () => stream.error(new DOMException("aborted", "AbortError")), { once: true });
    } }));
  });
  // Attach a rejection handler before advancing time.
  const result = runDeepSeekObject("teach", schema, { timeoutMs: 100 }).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(100);
  expect(await result).toMatchObject({ code: "timeout", retryable: true });
  expect(mockFetch.mock.calls[0][1]?.signal?.aborted).toBe(true);
});
