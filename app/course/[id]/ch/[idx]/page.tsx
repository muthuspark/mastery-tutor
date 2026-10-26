import { requirePageUser } from "@/lib/access";
import { ChapterPage } from "@/components/chapter-page";

export default async function ChapterRoute() {
  await requirePageUser();
  return <ChapterPage />;
}
