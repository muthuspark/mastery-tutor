import { TodaysStudy } from "@/components/todays-study";
import { requirePageUser } from "@/lib/access";
import { CourseList, type CourseSummary } from "@/components/course-list";
import { listUserCourses } from "@/lib/course-list";
import { NewCourseForm } from "@/components/new-course-form";
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
      <CourseList initialCourses={initialCourses} today={<TodaysStudy />}>
        <section className="course-creation" aria-labelledby="creation-title">
          <h2 id="creation-title" className="display">Start something new</h2>
          <NewCourseForm />
        </section>
      </CourseList>
    </main>
  );
}
