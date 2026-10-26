import { requirePageUser } from "@/lib/access";
import { CoursePage } from "@/components/course-page";

export default async function CourseRoute() {
  await requirePageUser();
  return <CoursePage />;
}
