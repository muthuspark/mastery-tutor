import { expect, test, type Response } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

test("recovers skipped questions, preserves answers, and saves the completed quiz", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  let releaseSubmission: (() => void) | undefined;
  let submission: Promise<Response> | undefined;
  try {
    const course = await request.get(`/api/courses/${fixture.courseId}`);
    expect(course.status(), "Fixture must be visible to the existing server; set RALPH_TEST_DATABASE if needed").toBe(200);
    // The real quiz endpoint delivers cached questions newest first.
    const delivered = [...fixture.questions].reverse();
    const heading = page.getByRole("heading", { level: 1 });
    const next = page.getByRole("button", { name: "Next question", exact: true });
    const previous = page.getByRole("button", { name: "Previous question", exact: true });
    const submit = page.getByRole("button", { name: "Submit answers", exact: true });
    // Next.js also renders a route-announcement alert outside the quiz main.
    const alert = page.getByRole("main").getByRole("alert");
    const option = (index: number, value = delivered[index].modelAnswer) => {
      const letter = String.fromCharCode(65 + delivered[index].options.indexOf(value));
      return page.getByRole("radio", { name: `${letter}. ${value}`, exact: true });
    };

    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    await expect(heading).toHaveText(delivered[0].prompt);
    await expect(previous).toBeDisabled();
    await next.click(); // Leave question 1 unanswered.
    await expect(heading).toHaveText(delivered[1].prompt);
    const revisedAnswer = delivered[1].options.find(value => value !== delivered[1].modelAnswer)!;
    await option(1, revisedAnswer).check();
    await previous.click();
    await expect(heading).toHaveText(delivered[0].prompt);
    await expect(page.getByRole("radio", { checked: true })).toHaveCount(0);
    await next.click();
    await expect(option(1, revisedAnswer)).toBeChecked();
    await option(1).check(); // Revise an answer before navigating again.
    await next.click();
    await expect(heading).toHaveText(delivered[2].prompt);
    await next.click(); // Also leave question 3 unanswered.
    for (let index = 3; index < delivered.length; index++) {
      await expect(heading).toHaveText(delivered[index].prompt);
      await option(index).check();
      if (index < delivered.length - 1) await next.click();
    }

    await submit.click();
    await expect(heading).toHaveText(delivered[0].prompt);
    await expect(alert).toHaveText("Answer question 1 before submitting. Your other answers are saved.");
    await expect(alert).toBeFocused();
    await expect(previous).toBeDisabled();
    expect(fixture.persisted().attempts).toEqual([]);
    await testInfo.attach("first-unanswered-recovery", { body: await page.screenshot(), contentType: "image/png" });
    await option(0).check();
    await expect(alert).toHaveCount(0);

    // Saved answers survive both directions, including the revised answer.
    for (let index = 1; index < delivered.length; index++) {
      await next.click();
      await expect(heading).toHaveText(delivered[index].prompt);
      if (index !== 2) await expect(option(index)).toBeChecked();
    }
    await submit.click();
    await expect(heading).toHaveText(delivered[2].prompt);
    await expect(alert).toHaveText("Answer question 3 before submitting. Your other answers are saved.");
    await expect(alert).toBeFocused();
    expect(fixture.persisted().attempts).toEqual([]);
    await option(2).check();
    await expect(alert).toHaveCount(0);
    await previous.click();
    await expect(option(1)).toBeChecked();
    await previous.click();
    await expect(option(0)).toBeChecked();
    for (let index = 1; index < delivered.length; index++) {
      await next.click();
      await expect(heading).toHaveText(delivered[index].prompt);
      await expect(option(index)).toBeChecked();
    }

    // Hold only the outgoing request to observe the pending UI reliably.
    // Continue to the real server without supplying a mocked response.
    const gate = new Promise<void>(resolve => { releaseSubmission = resolve; });
    const attemptsPath = `/api/chapters/${fixture.chapterId}/attempts`;
    await page.route(`**${attemptsPath}`, async route => {
      await gate;
      await route.continue();
    });
    submission = page.waitForResponse(response =>
      new URL(response.url()).pathname === attemptsPath && response.request().method() === "POST");
    await submit.click();
    await expect(previous).toBeDisabled();
    await expect(page.getByRole("button", { name: "Grading your answers…", exact: true })).toBeDisabled();
    for (const radio of await page.getByRole("radio").all()) await expect(radio).toBeDisabled();
    const back = page.getByRole("link", { name: "Back to chapter", exact: true });
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(back).toHaveAttribute("tabindex", "-1");
    await expect(page.getByRole("status")).toBeVisible();
    await expect(heading).toHaveText(delivered[9].prompt);
    releaseSubmission!();
    const response = await submission;
    expect(response.status()).toBe(200);
    const result = await response.json();
    expect(result).toMatchObject({ score: 1, passed: true, complete: true });
    expect(result.answers).toHaveLength(10);
    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await expect(page.getByText("Correct.", { exact: true })).toHaveCount(10);
    await testInfo.attach("recovered-quiz-result", { body: await page.screenshot(), contentType: "image/png" });

    await page.getByRole("link", { name: "← Back to course", exact: true }).click();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuenow", "100");
    await page.reload();
    await expect(page.getByRole("progressbar", { name: "Course mastery" })).toHaveAttribute("aria-valuetext", "1 of 1 chapters mastered");
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
    const persisted = fixture.persisted();
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
    expect(persisted.answers).toHaveLength(10);
    for (const question of delivered) {
      expect(persisted.answers.find(answer => answer.questionId === question.id))
        .toMatchObject({ response: question.modelAnswer, score: 1 });
    }
    expect(persisted.chapter?.status).toBe("passed");
    expect(persisted.jobs).toEqual([]);
    await testInfo.attach("recovered-quiz-persistence", { body: JSON.stringify(persisted, null, 2), contentType: "application/json" });
  } finally {
    releaseSubmission?.();
    // Drain a held real request before removing its test-owned rows.
    try {
      await page.unrouteAll({ behavior: "wait" });
      await submission?.catch(() => undefined);
    } finally { fixture.cleanup(); }
  }
});
