import { requirePageUser } from "@/lib/access";
import { CourseList, type CourseSummary } from "@/components/course-list";
import { listUserCourses } from "@/lib/course-list";
import { NewCourseForm } from "@/components/new-course-form";
import Image from "next/image";
import "./studies.css";

export default async function HomePage() {
  const user = await requirePageUser();
  let initialCourses: CourseSummary[] | undefined;
  try {
    initialCourses = listUserCourses(user.id).map(({ id, topic, createdAt, startedAt, preparationStatus, progress }) => ({
      id, topic, createdAt: createdAt.toISOString(), startedAt: startedAt?.toISOString() ?? null, preparationStatus, progress,
    }));
  } catch { /* Keep the client loading/retry path available if the initial read fails. */ }
  return (
    <main id="main-content" tabIndex={-1} className="page-shell home-page studies-page">
      <header className="studies-intro">
        <h1>Your learning workspace</h1>
        <p>A little progress, one chapter at a time.</p>
      </header>
      <CourseList initialCourses={initialCourses}>
        <section className="course-creation" aria-labelledby="creation-title">
          <h2 id="creation-title" className="display">Start something new</h2>
          <NewCourseForm />
          <Image className="studies-books" src="/images/studies-books.webp" width={1774} height={887} sizes="200px" alt="" aria-hidden="true" />
        </section>
      </CourseList>
    </main>
  );
}
