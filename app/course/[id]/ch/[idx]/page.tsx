import { requirePageUser } from "@/lib/access";
import { ChapterPage } from "@/components/chapter-page";
import "./reader.css";

export default async function ChapterRoute() {
  await requirePageUser();
  return <div className="chapter-reader-surface"><ChapterPage /></div>;
}
