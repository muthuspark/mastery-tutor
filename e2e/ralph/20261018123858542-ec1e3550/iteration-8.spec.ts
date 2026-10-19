import { expect, test } from "@playwright/test";
import { preparedMcqFixture } from "../fixtures";

// Only transient load responses are injected. Successful delivery, grading,
// lesson navigation, and persisted progress use the existing server/database.
test("quiz retry recovers to a real assessment and saves its result across reload", async ({ page, request }, testInfo) => {
  const fixture = preparedMcqFixture();
  try {
    expect((await request.get(`/api/courses/${fixture.courseId}`)).status(),
      "The server must see the fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
    const lessonPath = `/course/${fixture.courseId}/ch/0`;
    const quizApi = `/api/chapters/${fixture.chapterId}/quiz`;
    let quizRequests = 0;
    let courseRequests = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === `/api/courses/${fixture.courseId}`) courseRequests++;
    });
    await page.route(quizApi, async route => {
      quizRequests++;
      if (quizRequests === 1) await route.fulfill({ status: 503, json: { error: { message: "Test-owned transient outage" } } });
      else await route.continue();
    });
    await page.goto(`${lessonPath}/quiz`);
    await expect(page.getByRole("heading", { name: "Could not load QnA", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Could not load this QnA. Try again, or return to the chapter.");
    const back = page.getByRole("link", { name: "Back to chapter", exact: true });
    await expect(back).toHaveAttribute("href", lessonPath);
    const retry = page.getByRole("button", { name: "Try again", exact: true });
    await retry.focus();
    await expect(retry).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(back).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(retry).toBeFocused();
    await testInfo.attach("quiz-load-recovery", { body: await page.screenshot(), contentType: "image/png" });
    await page.keyboard.press("Enter");
    const delivered = [...fixture.questions].reverse();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(delivered[0].prompt);
    expect(quizRequests).toBe(2);
    expect(courseRequests).toBe(1);
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    for (const [index, question] of delivered.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(question.prompt);
      const letter = String.fromCharCode(65 + question.options.indexOf(question.modelAnswer));
      await page.getByRole("radio", { name: `${letter}. ${question.modelAnswer}`, exact: true }).check();
      if (index < delivered.length - 1) await page.getByRole("button", { name: "Next question", exact: true }).click();
    }
    const [graded] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === `/api/chapters/${fixture.chapterId}/attempts` && response.request().method() === "POST"),
      page.getByRole("button", { name: "Submit answers", exact: true }).click(),
    ]);
    expect(graded.status()).toBe(200);
    const result = await graded.json();
    expect(result).toMatchObject({ score: 1, passed: true, complete: true });
    await expect(page.getByRole("heading", { name: "Chapter complete", exact: true })).toBeVisible();
    await expect(page.getByText("100%", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "View completed course", exact: true }).click();
    await expect(page).toHaveURL(`/course/${fixture.courseId}`);
    await page.reload();
    await expect(page.getByText("You completed this course.", { exact: true })).toBeVisible();
    await expect(page.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", "100");
    const persisted = fixture.persisted();
    expect(persisted.attempts).toHaveLength(1);
    expect(persisted.attempts[0]).toMatchObject({ id: result.attemptId, score: 1, passed: true });
    expect(persisted.answers).toHaveLength(10);
    for (const question of fixture.questions) {
      expect(persisted.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: question.modelAnswer, score: 1 });
    }
    expect(persisted.chapter?.status).toBe("passed");
    expect(persisted.jobs).toEqual([]);
  } finally { fixture.cleanup(); }
});

test("course lookup retry loads questions and the recovery link returns to the real lesson", async ({ page, request }) => {
  const fixture = preparedMcqFixture();
  try {
    const courseApi = `/api/courses/${fixture.courseId}`;
    expect((await request.get(courseApi)).status()).toBe(200);
    let courseRequests = 0;
    let quizRequests = 0;
    await page.route(courseApi, async route => {
      courseRequests++;
      if (courseRequests === 1) await route.fulfill({ status: 500, json: { error: { message: "Test-owned lookup failure" } } });
      else await route.continue();
    });
    page.on("request", request => {
      if (new URL(request.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz`) quizRequests++;
    });
    const lessonPath = `/course/${fixture.courseId}/ch/0`;
    await page.goto(`${lessonPath}/quiz`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Could not load this QnA.");
    expect(quizRequests).toBe(0);
    await page.getByRole("button", { name: "Try again", exact: true }).press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(fixture.questions[9].prompt);
    expect(courseRequests).toBe(2);
    expect(quizRequests).toBe(1);

    // A new full navigation removes cached success so the return action is
    // exercised from an actual failure screen rather than from the quiz header.
    await page.route(`/api/chapters/${fixture.chapterId}/quiz`, route => route.fulfill({ status: 503, json: {} }));
    await page.reload();
    await expect(page.getByRole("heading", { name: "Could not load QnA", exact: true })).toBeVisible();
    await page.unroute(`/api/chapters/${fixture.chapterId}/quiz`);
    const back = page.getByRole("link", { name: "Back to chapter", exact: true });
    await back.focus();
    await expect(back).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(lessonPath);
    await expect(page.getByRole("main")).toContainText("Test-owned prepared lesson");
    expect(fixture.persisted().attempts).toEqual([]);
    expect(fixture.persisted().jobs).toEqual([]);
  } finally { fixture.cleanup(); }
});

test("pending preparation automatically retries and displays real questions when ready", async ({ page, request }) => {
  const fixture = preparedMcqFixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    expect((await request.get(`/api/courses/${fixture.courseId}`)).status()).toBe(200);
    let requests = 0;
    await page.route(`/api/chapters/${fixture.chapterId}/quiz`, async route => {
      requests++;
      if (requests === 1) await route.fulfill({ status: 202, json: { status: "generating", retryable: true } });
      else { await gate; await route.continue(); }
    });
    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    await expect.poll(() => requests).toBe(2);
    await expect(page.getByRole("status")).toHaveText("Preparing your QnA…");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    release();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(fixture.questions[9].prompt);
    await expect(page.getByRole("radio")).toHaveCount(4);
    expect(fixture.persisted().jobs).toEqual([]);
  } finally { release(); await page.unrouteAll({ behavior: "wait" }); fixture.cleanup(); }
});

test("exhausted preparation offers a manual retry that reaches the real quiz", async ({ page, request }) => {
  const fixture = preparedMcqFixture();
  try {
    expect((await request.get(`/api/courses/${fixture.courseId}`)).status()).toBe(200);
    await page.clock.install();
    let requests = 0;
    let recovered = false;
    await page.route(`/api/chapters/${fixture.chapterId}/quiz`, async route => {
      requests++;
      if (!recovered) await route.fulfill({ status: 202, json: { status: "generating", retryable: true } });
      else await route.continue();
    });
    await page.goto(`/course/${fixture.courseId}/ch/0/quiz`);
    await expect.poll(() => requests).toBe(1);
    // Advance the app's actual bounded retry schedule, without extending the
    // test timeout or changing the server's generation state.
    for (const [index, delay] of [1000, 2000, 4000, 8000].entries()) {
      await page.clock.runFor(delay + 100);
      await expect.poll(() => requests).toBe(index + 2);
    }
    await expect(page.getByRole("heading", { name: "QnA still preparing", exact: true })).toBeVisible();
    await expect(page.getByRole("status")).toHaveText("Your QnA is still being prepared. Try again in a moment, or return to the chapter while you wait.");
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Back to chapter", exact: true })).toHaveAttribute("href", `/course/${fixture.courseId}/ch/0`);
    recovered = true;
    await page.getByRole("button", { name: "Try again", exact: true }).press("Enter");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(fixture.questions[9].prompt);
    expect(requests).toBe(6);
    expect(fixture.persisted().jobs).toEqual([]);
  } finally { fixture.cleanup(); }
});

test("an unavailable chapter explains the problem and returns to the real course", async ({ page, request }) => {
  const fixture = preparedMcqFixture();
  try {
    expect((await request.get(`/api/courses/${fixture.courseId}`)).status()).toBe(200);
    let quizRequests = 0;
    page.on("request", request => {
      if (new URL(request.url()).pathname === `/api/chapters/${fixture.chapterId}/quiz`) quizRequests++;
    });
    await page.goto(`/course/${fixture.courseId}/ch/999/quiz`);
    await expect(page.getByRole("heading", { name: "QnA unavailable", exact: true })).toBeVisible();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("This chapter is unavailable. Return to the course to choose a chapter.");
    await expect(page.getByRole("button", { name: "Try again", exact: true })).toHaveCount(0);
    expect(quizRequests).toBe(0);
    const back = page.getByRole("link", { name: "Back to course", exact: true });
    await expect(back).toHaveAttribute("href", `/course/${fixture.courseId}`);
    await back.press("Enter");
    await expect(page).toHaveURL(`/course/${fixture.courseId}`);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(`Ralph test-owned quiz ${fixture.courseId}`);
    expect(fixture.persisted().attempts).toEqual([]);
    expect(fixture.persisted().jobs).toEqual([]);
  } finally { fixture.cleanup(); }
});
