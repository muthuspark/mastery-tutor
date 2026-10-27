"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";

type Course = { id: string; topic: string; createdAt: string; startedAt?: string | null; preparationStatus?: string; progress: { passed: number; total: number } };

export function CourseList({ children }: { children?: ReactNode }) {
  const { data, isLoading, isError, refetch } = useQuery<{ courses: Course[] }>({ queryKey: ["courses"], queryFn: async () => {
    const response = await fetch("/api/courses");
    if (!response.ok) throw new Error("Could not load your studies");
    return response.json();
  }, refetchInterval: (query) => query.state.data?.courses.some((course) => ["pending", "generating"].includes(course.preparationStatus ?? "")) ? 5_000 : false });
  const courses = data?.courses ?? [];
  const empty = !isLoading && !isError && courses.length === 0;
  const featured = courses
    .filter((course) => (!course.preparationStatus || course.preparationStatus === "ready") && course.progress.total > course.progress.passed)
    .sort((a, b) => {
      const startedFirst = Number(Boolean(b.startedAt || b.progress.passed)) - Number(Boolean(a.startedAt || a.progress.passed));
      return startedFirst || Date.parse(b.startedAt ?? b.createdAt) - Date.parse(a.startedAt ?? a.createdAt);
    })[0];
  return (
    <div className={`learning-workspace${empty ? " learning-workspace--empty" : ""}`}>
      {isLoading ? <div className="resume-skeleton" aria-hidden="true" /> : featured && !isError ? <FeaturedStudy course={featured} /> : null}
      {empty ? children : null}
      <section className="studies-section" aria-labelledby="studies-title">
        <div className="studies-heading"><h2 id="studies-title" className="display text-3xl">Your studies</h2>{!isLoading && !isError ? <span className="subject-count ui shrink-0">{courses.length} {courses.length === 1 ? "subject" : "subjects"}</span> : null}</div>
        {isLoading ? <p className="loading-state ui mt-8 text-sm text-[var(--muted)]" role="status">Loading your studies…</p> : isError ? <p className="ui mt-5 text-sm text-[var(--accent-dark)]" role="alert">Could not load your studies. <button className="text-button min-h-11 text-sm!" onClick={() => void refetch()}>Try again</button></p> : courses.length === 0 ? <p className="empty-studies text-[var(--muted)]">Choose a topic to start your first study. Your saved studies and progress will appear here.</p> : (
          <div className="studies-list">
            {courses.map((course) => {
              const { passed, total } = course.progress;
              const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
              const completed = total > 0 && passed === total;
              const preparing = course.preparationStatus && course.preparationStatus !== "ready";
              return (
                <Link className="study-link group" href={`/course/${course.id}`} key={course.id}>
                  <div className="study-heading">
                    <h3 className="study-topic">{course.topic}</h3>
                    <span className="study-action ui">{preparing ? course.preparationStatus === "failed" ? "Try again" : "View status" : completed ? "Review" : "Continue"} →</span>
                  </div>
                  <div className="study-meta ui">
                    <span>{preparing ? course.preparationStatus === "failed" ? "Preparation needs attention" : "Preparing your course" : `${passed} of ${total} chapters mastered`}</span>
                    {!preparing ? <span className="study-percent">{percent}%</span> : null}
                  </div>
                  {!preparing ? <StudyProgress course={course} /> : null}
                </Link>
              );
            })}
          </div>
        )}
      </section>
      {!empty && !isLoading ? children : null}
    </div>
  );
}

function FeaturedStudy({ course }: { course: Course }) {
  const started = Boolean(course.startedAt || course.progress.passed);
  const percent = Math.round((course.progress.passed / course.progress.total) * 100);
  return (
    <section className="featured-study" aria-labelledby="featured-study-title">
      <div className="featured-study-content">
        <p className="featured-study-label ui">{started ? "Continue studying" : "Start studying"}</p>
        <h2 id="featured-study-title" className="display">{course.topic}</h2>
        <p className="featured-study-meta ui">{course.progress.passed} of {course.progress.total} chapters mastered</p>
        <div className="featured-study-progress"><StudyProgress course={course} /><span className="ui">{percent}%</span></div>
      </div>
      <Link className="button-primary" href={`/course/${course.id}`}>{started ? "Continue studying" : "Start studying"} →</Link>
      <Image className="featured-study-art" src="/images/newton-under-apple-tree.webp" width={1254} height={1254} sizes="(max-width: 767px) 110px, 176px" alt="" aria-hidden="true" preload />
    </section>
  );
}

function StudyProgress({ course }: { course: Course }) {
  const { passed, total } = course.progress;
  const percent = total > 0 ? Math.round((passed / total) * 100) : 0;
  return (
    <div className="study-progress" role="progressbar" aria-label={`${course.topic} progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-valuetext={`${passed} of ${total} chapters mastered`}>
      <progress className={`progress-fill${total > 0 && passed === total ? " is-complete" : ""}`} value={percent} max={100} aria-hidden="true" />
    </div>
  );
}
