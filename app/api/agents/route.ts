import { NextResponse } from "next/server";
import { agentForRequest, agentSchema, AGENT_COOKIE, availableAgents } from "@/lib/agent";

export async function GET(request: Request) {
  const available = await availableAgents();
  const selected = await agentForRequest(request);
  return NextResponse.json({ available, selected: selected ?? null });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { agent?: unknown } | null;
  const parsed = agentSchema.safeParse(body?.agent);
  if (!parsed.success) return NextResponse.json({ error: { message: "Choose a supported agent." } }, { status: 400 });
  const available = await availableAgents();
  if (!available.includes(parsed.data)) return NextResponse.json({ error: { message: "That agent is not available." } }, { status: 503 });
  const response = NextResponse.json({ selected: parsed.data });
  response.cookies.set(AGENT_COOKIE, parsed.data, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 31_536_000 });
  return response;
}
