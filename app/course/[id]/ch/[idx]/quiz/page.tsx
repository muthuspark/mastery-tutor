import { requirePageUser } from "@/lib/access";
import { QuizPage } from "@/components/quiz-page";

export default async function QuizRoute() {
  await requirePageUser();
  return <QuizPage />;
}
