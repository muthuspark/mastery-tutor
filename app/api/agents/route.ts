import { NextResponse } from "next/server";
import { authorize } from "@/lib/access";
// Kept for old clients, but learner requests can no longer choose server providers.
export async function GET() {
  const access = await authorize();
  if (access instanceof Response) return access;
  return NextResponse.json({ error: { message: "This setting is managed by the service." } }, { status: 410 });
}
export async function POST() { return GET(); }
