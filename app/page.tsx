import { CourseList } from "@/components/course-list";
import { NewCourseForm } from "@/components/new-course-form";

export default function HomePage() {
  return (
    <main className="page-shell home-page">
      <div className="grid items-start gap-12 py-10 md:py-14 lg:grid-cols-2 lg:gap-20">
        <section className="min-w-0">
          <h1 className="display max-w-[19ch] text-4xl leading-[1.08] md:text-5xl">What do you want to learn?</h1>
          <div className="mt-7"><NewCourseForm /></div>
        </section>
        <CourseList />
      </div>
    </main>
  );
}
