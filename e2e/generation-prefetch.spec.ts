import { expect, test } from "@playwright/test";

test("prefetches the current quiz and next reachable chapter", async ({ page }) => {
  let quizRequested = false;
  let nextChapterRequested = false;
  const chapters = [
    { id: "chapter-0", idx: 0, title: "Foundations", status: "open" },
    { id: "chapter-1", idx: 1, title: "Next idea", status: "open" },
  ];
  const questions = Array.from({ length: 10 }, (_, index) => ({
    id: `question-${index}`,
    type: "mcq",
    prompt: `Question ${index + 1}`,
    options: ["A", "B", "C", "D"],
    isReview: false,
  }));

  await page.route("**/api/courses/course-1", async (route) => {
    await route.fulfill({ json: { course: { topic: "Testing" }, chapters, progress: { passed: 0, total: 2 } } });
  });
  await page.route("**/api/chapters/chapter-0", async (route) => {
    await route.fulfill({ json: { chapter: { ...chapters[0], pretest: null }, html: "<p>Ready chapter</p>" } });
  });
  await page.route("**/api/chapters/chapter-0/quiz", async (route) => {
    quizRequested = true;
    await route.fulfill({ json: { questions } });
  });
  await page.route("**/api/chapters/chapter-1", async (route) => {
    nextChapterRequested = true;
    await route.fulfill({ json: { chapter: { ...chapters[1], pretest: null }, html: "<p>Next chapter</p>" } });
  });

  await page.goto("/course/course-1/ch/0");
  await expect(page.getByText("Ready chapter")).toBeVisible();
  await expect.poll(() => quizRequested).toBe(true);
  await expect.poll(() => nextChapterRequested).toBe(true);
});
