import { CourseList } from "@/components/course-list";
import { NewCourseForm } from "@/components/new-course-form";

export default function HomePage() {
  return (
    <main id="main-content" tabIndex={-1} className="page-shell home-page">
      <section className="home-intro" aria-labelledby="home-title">
        <div><p className="eyebrow">The learning journal</p><h1 id="home-title" className="home-title">What do you want to learn?</h1></div>
        <div className="home-intro-note"><p>Make room for a new idea. Explore a subject, work through its questions, and build understanding at your own pace.</p><p className="ui intro-method"><span>01 Read</span><span>02 Practice</span><span>03 Reflect</span></p></div>
      </section>
      <div className="learning-workspace">
        <section className="course-creation" aria-labelledby="new-study-title">
          <p className="eyebrow">A new line of inquiry</p>
          <h2 id="new-study-title" className="display">Begin with a question.</h2>
          <p className="creation-description">A subject you’re curious about. An idea you want to understand. Start here.</p>
          <NewCourseForm />
        </section>
        <CourseList />
      </div>
    </main>
  );
}
