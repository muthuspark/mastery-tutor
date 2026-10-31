import { authorize } from "@/lib/access";
import { loadReview } from "@/lib/study-store";
import { studyError, studyJson } from "@/lib/study-response";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await authorize();
  if (access instanceof Response) return access;
  try {
    return studyJson(loadReview(access.user.id, (await context.params).id));
  } catch (error) {
    return studyError(error);
  }
}
