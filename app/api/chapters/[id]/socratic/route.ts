import { authorize } from "@/lib/access";
import { after, NextResponse } from "next/server";
import { agentForRequest } from "@/lib/agent";
import { classifyCodexFailure } from "@/lib/codex-errors";
import { advanceSocratic, prefetchSocratic, SocraticError } from "@/lib/socratic";
import { socraticRequestSchema } from "@/lib/socratic-contracts";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const access = await authorize("chapter", await context.params);
  if (access instanceof Response) return access;
  const parsed = socraticRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { message: "Invalid practice request." } }, { status: 400 });
  const { id } = await context.params;
  try {
    const agent = await agentForRequest(request);
    const session = await advanceSocratic(id, parsed.data, agent);
    if (agent && session.question) after(() => prefetchSocratic(id, session.id, agent));
    return NextResponse.json(session);
  } catch (error) {
    if (error instanceof SocraticError) return NextResponse.json({ error: { message: error.message } }, { status: error.status });
    const failure = classifyCodexFailure(error);
    return NextResponse.json({ error: { message: failure.message, retryable: failure.retryable } }, { status: failure.code === "timeout" ? 504 : 503 });
  }
}
