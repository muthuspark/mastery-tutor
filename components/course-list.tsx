"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

type Course = { id: string; topic: string; createdAt: string };

export function CourseList() {
  const { data, isLoading } = useQuery<{ courses: Course[] }>({ queryKey: ["courses"], queryFn: () => fetch("/api/courses").then((response) => response.json()) });
  if (isLoading || !data?.courses.length) return null;
  return (
    <section className="border-t border-[var(--line)] pt-7">
      <div className="flex items-baseline justify-between gap-4"><h2 className="display text-3xl">Your studies</h2><span className="ui text-xs text-[var(--muted)]">{data.courses.length} {data.courses.length === 1 ? "subject" : "subjects"}</span></div>
      <div className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
        {data.courses.map((course) => <Link className="group flex items-center justify-between gap-4 py-4 no-underline transition-colors hover:text-[var(--accent)]" href={`/course/${course.id}`} key={course.id}><span className="text-xl">{course.topic}</span><span className="ui text-xs text-[var(--muted)] group-hover:text-[var(--accent)]">Continue →</span></Link>)}
      </div>
    </section>
  );
}
