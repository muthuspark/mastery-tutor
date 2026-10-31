export type StudyItem = {
  id: string;
  concept: string;
  course: string;
  chapter: string;
  courseId: string;
  chapterIdx: number;
  dueDate: string;
  reason: string;
};
export type NextLesson = {
  course: string;
  title: string;
  href: string;
  reason: string;
};
export type TodayStudy = {
  setupRequired: boolean;
  today: string;
  timeZone: string;
  nextRollover: string;
  dueCount: number;
  unavailableCount: number;
  items: StudyItem[];
  nextLesson: NextLesson | null;
  nextDueDate: string | null;
  openReviewId: string | null;
};
export type ReviewPublic = {
  id: string;
  status: string;
  questions: {
    id: string;
    prompt: string;
    options: string[];
    concept: string;
    course: string;
    reason: string;
  }[];
  result: ReviewResult | null;
};
export type ReviewResult = {
  answers: {
    id: string;
    concept: string;
    prompt: string;
    response: string;
    correct: boolean;
    feedback: string;
    modelAnswer: string;
    dueDate: string;
  }[];
};
