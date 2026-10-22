import "server-only";

import { z } from "zod";
import { agentTimeoutMs } from "./agent-timeout";
import { CodexError } from "./codex-errors";

type DeepSeekOptions = { model?: string; timeoutMs?: number; maxTokens?: number };

const completionSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.literal("stop"),
    message: z.object({ content: z.string().trim().min(1) }),
  })).min(1),
});

function httpFailure(status: number) {
  if (status === 401 || status === 403) return new CodexError("failed", "DeepSeek authentication failed. Check DEEPSEEK_API_KEY and restart the server.", false);
  if (status === 402) return new CodexError("failed", "DeepSeek account balance is insufficient. Add funds before retrying.", false);
  if (status === 408 || status === 429 || status >= 500) return new CodexError("failed", "DeepSeek is temporarily unavailable. Try again.", true);
  return new CodexError("failed", "DeepSeek rejected the request. Check the model and server configuration.", false);
}

export async function runDeepSeekObject<T>(
  prompt: string,
  schema: z.ZodType<T>,
  options: DeepSeekOptions = {},
): Promise<T> {
  const key = process.env.DEEPSEEK_API_KEY?.trim();
  if (!key) throw new CodexError("not_found", "Configure DEEPSEEK_API_KEY on the server and restart to use DeepSeek API.", false);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? agentTimeoutMs("deepseek"));
  try {
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      redirect: "manual",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: options.model ?? "deepseek-flash",
        stream: false,
        response_format: { type: "json_object" },
        thinking: { type: "disabled" },
        max_tokens: options.maxTokens ?? 16384,
        messages: [
          { role: "system", content: `Return only a valid JSON object that matches the supplied JSON Schema. Illustrative JSON format: {"example":"value"}. This example shows JSON syntax only; use the actual fields and constraints from the schema instead.\nJSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!response.ok) {
      // Never read or log upstream error bodies, which may echo credentials or prompts.
      await response.body?.cancel();
      throw httpFailure(response.status);
    }
    const envelope = completionSchema.parse(await response.json());
    return schema.parse(JSON.parse(envelope.choices[0].message.content));
  } catch (error) {
    if (controller.signal.aborted) throw new CodexError("timeout", "DeepSeek API timed out. Try again.", true);
    if (error instanceof CodexError) throw error;
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      throw new CodexError("invalid_output", "DeepSeek returned invalid structured output.", true);
    }
    throw new CodexError("failed", "Could not reach DeepSeek API. Try again.", true);
  } finally {
    clearTimeout(timer);
  }
}
