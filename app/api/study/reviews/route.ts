import { authorize } from "@/lib/access";
import { issueReview } from "@/lib/study-store";
import { studyError, studyJson } from "@/lib/study-response";
export async function POST(request: Request) {
  const access = await authorize();
  if (access instanceof Response) return access;
  const body = await request.json().catch(() => ({}));
  if (
    body === null ||
    typeof body !== "object" ||
    (body.restart !== undefined && typeof body.restart !== "boolean")
  )
    return studyJson({ error: { message: "Invalid review request." } }, 400);
  try {
    return studyJson(
      issueReview(access.user.id, new Date(), body.restart === true),
    );
  } catch (error) {
    return studyError(error);
  }
}
