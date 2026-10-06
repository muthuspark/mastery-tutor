import { CourseList } from "@/components/course-list";
import { NewCourseForm } from "@/components/new-course-form";

export default function HomePage() {
  return (
    <main className="page-shell">
      <header className="flex items-center justify-between border-b border-[var(--line)] pb-4">
        <span className="eyebrow">Mastery Tutor</span>
        <span className="ui text-xs text-[var(--muted)]">A quiet place to learn</span>
      </header>
      <section className="grid gap-12 py-[clamp(4rem,12vw,9rem)] md:grid-cols-[minmax(0,1fr)_minmax(18rem,0.7fr)] md:items-end md:gap-20">
        <div>
          <p className="eyebrow">Begin anywhere</p>
          <h1 className="display mt-4 max-w-2xl text-[clamp(3.25rem,8vw,6rem)] leading-[0.9]">What do you want to understand?</h1>
          <p className="mt-7 max-w-xl text-xl leading-8 text-[var(--muted)]">Name a subject. We’ll shape it into a path, one idea at a time.</p>
        </div>
        <NewCourseForm />
      </section>
      <CourseList />
    </main>
  );
}
