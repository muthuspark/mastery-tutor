import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
import { getProfile, saveProfile } from "@/lib/profile";
import { profileSchema } from "@/lib/profile-schema";
export async function GET() {
  const access = await authorize();
  if (access instanceof Response) return access;
  return NextResponse.json(getProfile(access.user.id), { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  const access = await authorize();
  if (access instanceof Response) return access;
  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: { code: "invalid_input", message: "Enter an About me description of up to 2,000 characters.", retryable: false } }, { status: 400 });
  try { return NextResponse.json(saveProfile(access.user.id, parsed.data.aboutMe)); }
  catch { return NextResponse.json({ error: { code: "database_error", message: "Could not save your profile. Please try again.", retryable: true } }, { status: 500 }); }
}
