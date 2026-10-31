import { authorize } from "@/lib/access";
import { setupStudy } from "@/lib/study-store";
import { studyError, studyJson } from "@/lib/study-response";
import { z } from "zod";
const schema = z.object({ timeZone: z.string().min(1).max(100) });
export async function PUT(request: Request) {
  const access = await authorize();
  if (access instanceof Response) return access;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return studyJson(
      { error: { message: "Choose a valid review time zone." } },
      400,
    );
  try {
    return studyJson(setupStudy(access.user.id, parsed.data.timeZone));
  } catch (error) {
    return studyError(error);
  }
}
