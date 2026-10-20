import { CourseList } from "@/components/course-list";
import { NewCourseForm } from "@/components/new-course-form";

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell home-page">
      <div className="learning-workspace">
        <section className="course-creation" aria-labelledby="home-title">
          <h1 id="home-title" className="display">What do you want to learn?</h1>
          <NewCourseForm />
        </section>
        <CourseList />
      </div>
    </main>
  );
}
