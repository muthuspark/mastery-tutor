"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

type Course = { id: string; topic: string; createdAt: string; progress: { passed: number; total: number } };

export function CourseList() {
  const { data, isLoading, isError, refetch } = useQuery<{ courses: Course[] }>({ queryKey: ["courses"], queryFn: async () => {
    const response = await fetch("/api/courses");
    if (!response.ok) throw new Error("Could not load your studies");
    return response.json();
  } });
  const courses = data?.courses ?? [];
  return (
    <section className="studies-section" aria-labelledby="studies-title">
      <div className="studies-heading"><h2 id="studies-title" className="display text-3xl">Your studies</h2>{!isLoading && !isError ? <span className="subject-count ui shrink-0">{courses.length} {courses.length === 1 ? "subject" : "subjects"}</span> : null}</div>
      {isLoading ? <p className="loading-state ui mt-8 text-sm text-[var(--muted)]" role="status">Loading your studies…</p> : isError ? <p className="ui mt-5 text-sm text-[var(--accent-dark)]" role="alert">Could not load your studies. <button className="text-button min-h-11 text-sm!" onClick={() => void refetch()}>Try again</button></p> : courses.length === 0 ? <p className="empty-studies"><span className="empty-studies__mark" aria-hidden="true">Your first study</span><span className="display block text-3xl">A fresh page.</span><span className="mt-3 block text-[var(--muted)]">Your learning paths will appear here. Begin with a subject you’re curious about.</span></p> : (
        <div className="studies-list">
          {courses.map((course) => {
            const { passed, total } = course.progress;
            const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
            const completed = total > 0 && passed === total;
            return (
              <Link className="study-link group" href={`/course/${course.id}`} key={course.id}>
                <div className="flex items-baseline justify-between gap-4">
                  <span className="study-topic min-w-0">{course.topic}</span>
                  <span className="study-action ui shrink-0 text-sm">{completed ? "Review" : "Continue"} →</span>
                </div>
                <div className="ui mt-3 flex justify-between gap-4 text-sm text-[var(--muted)]">
                  <span>{passed} of {total} chapters mastered</span>
                  <span>{percent}%</span>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden bg-[var(--line)]" role="progressbar" aria-label={`${course.topic} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${passed} of ${total} chapters mastered`}>
                  <div className={`h-full ${completed ? "bg-[var(--success)]" : "bg-[var(--accent)]"}`} style={{ width: `${percent}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
