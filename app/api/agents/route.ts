import { NextResponse } from "next/server";
import { availableAgents, agentSchema } from "@/lib/agent";
import { getProfile, saveLearningAgent } from "@/lib/profile";

export async function GET() {
  const available = await availableAgents();
  const selected = getProfile().learningAgent ?? available[0] ?? null;
  return NextResponse.json({ available, selected }, { headers: { "Cache-Control": "no-store" } });
}

// Compatibility for existing clients: persist the preference in the profile, not a cookie.
export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { agent?: unknown } | null;
  const parsed = agentSchema.safeParse(body?.agent);
  if (!parsed.success) return NextResponse.json({ error: { message: "Choose a supported agent." } }, { status: 400 });
  if (!(await availableAgents()).includes(parsed.data)) return NextResponse.json({ error: { message: "That agent is not available." } }, { status: 503 });
  saveLearningAgent(parsed.data);
  return NextResponse.json({ selected: parsed.data });
}
