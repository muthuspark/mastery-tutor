import { CourseList } from "@/components/course-list";
import { NewCourseForm } from "@/components/new-course-form";

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell home-page">
      <h1 className="sr-only">Your learning workspace</h1>
      <CourseList>
        <section className="course-creation" aria-labelledby="creation-title">
          <h2 id="creation-title" className="display">Start something new</h2>
          <NewCourseForm />
        </section>
      </CourseList>
    </main>
  );
}
