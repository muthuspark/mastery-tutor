import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/profile";
import { availableAgents } from "@/lib/agent";
import { profileSchema } from "@/lib/profile-schema";

function databaseError() {
  return NextResponse.json({ error: { code: "database_error", message: "Could not access your profile. Please try again.", retryable: true } }, { status: 500 });
}

export async function GET() {
  try {
    return NextResponse.json(getProfile(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return databaseError();
  }
}

export async function PUT(request: Request) {
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "invalid_input", message: "Enter an About me description of up to 2,000 characters and choose a supported learning agent.", retryable: false } }, { status: 400 });
  }
  try {
    const current = getProfile();
    const selected = parsed.data.learningAgent;
    if (selected && selected !== current.learningAgent && !(await availableAgents()).includes(selected)) {
      return NextResponse.json({ error: { code: "agent_unavailable", message: "That learning agent is unavailable. Choose a configured agent.", retryable: false } }, { status: 503 });
    }
    return NextResponse.json(saveProfile(parsed.data.aboutMe, selected === undefined ? current.learningAgent : selected));
  } catch {
    return databaseError();
  }
}
