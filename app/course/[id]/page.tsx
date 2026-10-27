import { requirePageUser } from "@/lib/access";
import { CoursePage } from "@/components/course-page";
import "./course-index.css";

export default async function CourseRoute() {
  await requirePageUser();
  return <div className="course-index-surface"><CoursePage /></div>;
}
