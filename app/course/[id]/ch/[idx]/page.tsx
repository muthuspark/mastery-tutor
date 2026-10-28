import { requirePageUser } from "@/lib/access";
import { ChapterPage } from "@/components/chapter-page";
import "katex/dist/katex.min.css";
import "./reader.css";

export default async function ChapterRoute() {
  await requirePageUser();
  return <div className="chapter-reader-surface"><ChapterPage /></div>;
}
