import { authorize } from "@/lib/access";
import { todayStudy } from "@/lib/study-store";
import { studyError, studyJson } from "@/lib/study-response";
export async function GET() {
  const access = await authorize();
  if (access instanceof Response) return access;
  try {
    return studyJson(todayStudy(access.user.id));
  } catch (error) {
    return studyError(error);
  }
}
