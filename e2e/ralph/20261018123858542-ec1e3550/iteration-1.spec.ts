import { expect, test } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

// Unit tests establish zero agent discovery/execution with unavailable CLIs.
// This adds real browser/API/SQLite evidence without changing the server's CLIs.
test("submits a prepared MCQ quiz through the real API and preserves graded progress", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  try {
    const course = await request.get(`/api/courses/${fixture.courseId}`);
    expect(course.status(), "The fixture must be in the existing app's database; set RALPH_TEST_DATABASE if needed").toBe(200);
    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    let incorrectAnswer = "";
    for (let index = 0; index < 10; index++) {
      // The real quiz endpoint orders cached questions by creation time descending.
      const question = fixture.questions[9 - index];
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      const correct = question.options.indexOf(question.modelAnswer);
      const selected = index === 9 ? (correct + 1) % 4 : correct;
      await page.getByRole("radio").nth(selected).check();
      if (index < 9) {
        await page.getByRole("button", { name: "Next question", exact: true }).click();
      } else {
        incorrectAnswer = question.modelAnswer;
        const submission = page.waitForResponse(response => response.url().endsWith(`/api/chapters/${fixture.chapterId}/attempts`) && response.request().method() === "POST");
        await page.getByRole("button", { name: "Submit answers", exact: true }).click();
        const response = await submission;
        expect(response.status()).toBe(200);
        const result = await response.json();
        expect(result).toMatchObject({ passed: true, score: 0.9, complete: true });
        expect(result.answers).toHaveLength(10);
      }
    }
    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("90%", { exact: true })).toBeVisible();
    await expect(page.getByText("Correct.", { exact: true })).toHaveCount(9);
    await expect(page.getByText(`The expected answer is: ${incorrectAnswer}.`, { exact: true })).toBeVisible();
    await testInfo.attach("graded-quiz", { body: await page.screenshot(), contentType: "image/png" });

    await page.goto(`/course/${fixture.courseId}`);
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", "100");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuetext", "1 of 1 chapters mastered");
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
    const reloaded = await request.get(`/api/courses/${fixture.courseId}`);
    expect((await reloaded.json()).progress).toEqual({ passed: 1, total: 1 });
    const persisted = fixture.persisted();
    expect(persisted.attempts).toMatchObject([{ score: 0.9, passed: true }]);
    expect(persisted.answers).toHaveLength(10);
    expect(persisted.answers.filter(answer => answer.score === 1)).toHaveLength(9);
    expect(persisted.chapter?.status).toBe("passed");
    expect(persisted.jobs).toEqual([]); // Prepared fixtures must not trigger generation.
    await testInfo.attach("persisted-fixture-evidence", { body: Buffer.from(JSON.stringify(persisted, null, 2)), contentType: "application/json" });
  } finally { fixture.cleanup(); }
});
