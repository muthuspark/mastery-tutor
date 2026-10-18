import { NextResponse } from "next/server";
import { getProfile, saveProfile } from "@/lib/profile";
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
    return NextResponse.json({ error: { code: "invalid_input", message: "Enter an About me description of up to 2,000 characters.", retryable: false } }, { status: 400 });
  }
  try {
    return NextResponse.json(saveProfile(parsed.data.aboutMe));
  } catch {
    return databaseError();
  }
}
