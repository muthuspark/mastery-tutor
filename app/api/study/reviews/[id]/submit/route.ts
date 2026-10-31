import { authorize } from "@/lib/access";
import { submitReview } from "@/lib/study-store";
import { studyError, studyJson } from "@/lib/study-response";
import { z } from "zod";
const schema = z.object({
  answers: z
    .array(
      z.object({
        questionId: z.string().min(1),
        selectedOptionIndex: z.number().int().min(0).max(100),
      }),
    )
    .min(1)
    .max(5),
});
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const access = await authorize();
  if (access instanceof Response) return access;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return studyJson(
      { error: { message: "Answer each question with one valid option." } },
      400,
    );
  try {
    return studyJson(
      submitReview(
        access.user.id,
        (await context.params).id,
        parsed.data.answers,
      ),
    );
  } catch (error) {
    return studyError(error);
  }
}
