import { requirePageUser } from "@/lib/access";
import { StudyReview } from "@/components/study-review";
import "./review.css";
export default async function StudyReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePageUser();
  return <StudyReview id={(await params).id} />;
}
