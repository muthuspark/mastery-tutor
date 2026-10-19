import { expect, test, type Page } from "@playwright/test";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { preparedMcqFixture } from "../fixtures";

async function expectNoOverflow(page: Page) {
  const main = page.getByRole("main");
  await expect(main).toBeVisible();
  expect(await main.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
}

for (const width of [375, 768, 1440]) {
  for (const pass of [true, false]) {
    test(`${pass ? "passing" : "failed"} quiz keeps question and result focus predictable at ${width}px`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = preparedMcqFixture();
      try {
        // Never change the cached answer keys: invalid/unbalanced questions can
        // start generation even when the fixture says its quiz is ready.
        expect(isBalancedQuiz(fixture.questions)).toBe(true);
        const coursePath = `/course/${fixture.courseId}`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const visible = await request.get(`/api/courses/${fixture.courseId}`);
        expect(visible.status(), "The existing server must see the fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
        const course = await visible.json();
        let submissions = 0;
        let submissionStarted = false;
        const unexpectedWrites: string[] = [];
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (req.method() === "POST" && pathname === `${chapterApi}/attempts` && submissions === 0) {
            submissions += 1;
            submissionStarted = true;
            await route.continue(); // Real deterministic MCQ grading and saving.
          } else if (req.method() !== "GET") {
            unexpectedWrites.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          } else if (pathname === `${chapterApi}/quiz` && submissionStarted) {
            // Result links may prefetch. A failed attempt makes another quiz
            // GET generate paid content; isolate only that out-of-scope action.
            await route.fulfill({ status: 503, json: { error: { message: "Fresh quiz generation is outside this test." } } });
          } else await route.continue();
        });

        const delivered = [...fixture.questions].reverse();
        const responses = delivered.map(question => {
          const correct = question.options.indexOf(question.modelAnswer);
          return question.options[pass ? correct : (correct + 1) % 4];
        });
        const delivery = page.waitForResponse(response =>
          new URL(response.url()).pathname === `${chapterApi}/quiz` && response.request().method() === "GET");
        await page.goto(`${coursePath}/ch/0/quiz`);
        const quiz = await delivery;
        expect(quiz.status()).toBe(200);
        expect(await quiz.json()).toEqual({ questions: delivered.map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview })) });
        const main = page.getByRole("main");
        const heading = main.getByRole("heading", { level: 1 });
        const next = main.getByRole("button", { name: "Next question", exact: true });
        const previous = main.getByRole("button", { name: "Previous question", exact: true });
        const radioFor = (index: number, response: string) => main.getByRole("radiogroup", { name: delivered[index].prompt, exact: true })
          .getByRole("radio", { name: `${String.fromCharCode(65 + delivered[index].options.indexOf(response))}. ${response}`, exact: true });
        await expect(previous).toBeDisabled();

        for (const [index, question] of delivered.entries()) {
          await expect(heading).toHaveText(question.prompt);
          if (index > 0) await expect(heading).toBeFocused();
          const group = main.getByRole("radiogroup", { name: question.prompt, exact: true });
          await expect(group).toBeVisible();
          await expect(group).toHaveAccessibleName(question.prompt);
          await expect(group.getByRole("radio")).toHaveCount(4);
          for (const [position, option] of question.options.entries()) {
            const radio = group.getByRole("radio", { name: `${String.fromCharCode(65 + position)}. ${option}`, exact: true });
            await expect(radio).toHaveAttribute("type", "radio");
            await expect(radio).toBeVisible();
          }
          await expectNoOverflow(page);
          // Leave question 2 unanswered to exercise the existing focused error.
          if (index !== 1) {
            if (index === 0) {
              const first = radioFor(index, question.options[0]);
              const second = radioFor(index, question.options[1]);
              await first.focus();
              await first.press("Space");
              await expect(first).toBeChecked();
              await expect(first).toBeFocused();
              await first.press("ArrowDown");
              await expect(second).toBeChecked();
              await expect(second).toBeFocused();
              await expect(first).not.toBeChecked();
              await second.press("ArrowUp");
              await expect(first).toBeChecked();
              await expect(first).toBeFocused();
              // Select the intended answer through the native radio keyboard.
              for (let step = 0; step < question.options.indexOf(responses[index]); step++) await page.keyboard.press("ArrowDown");
            } else await radioFor(index, responses[index]).check();
            await expect(radioFor(index, responses[index])).toBeChecked();
          }
          if (index === 2) {
            await previous.click();
            await expect(heading).toHaveText(delivered[1].prompt);
            await expect(heading).toBeFocused();
            await previous.click();
            await expect(heading).toHaveText(delivered[0].prompt);
            await expect(heading).toBeFocused();
            await expect(radioFor(0, responses[0])).toBeChecked();
            await next.click();
            await expect(heading).toHaveText(delivered[1].prompt);
            await expect(heading).toBeFocused();
            await next.click();
            await expect(heading).toHaveText(question.prompt);
            await expect(heading).toBeFocused();
            await expect(radioFor(index, responses[index])).toBeChecked();
          }
          if (index < 9) await next.click();
        }

        await main.getByRole("button", { name: "Submit answers", exact: true }).click();
        const explanation = main.getByRole("alert").filter({ hasText: "Answer question 2 before submitting. Your other answers are saved." });
        await expect(explanation).toHaveText("Answer question 2 before submitting. Your other answers are saved.");
        await expect(explanation).toBeFocused();
        await expect(heading).toHaveText(delivered[1].prompt);
        await expect(heading).not.toBeFocused();
        expect(submissions).toBe(0);
        expect(fixture.persisted().attempts).toEqual([]);
        await expectNoOverflow(page);
        await info.attach("focused-skipped-question-explanation", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });
        await radioFor(1, responses[1]).check();
        await expect(explanation).toHaveCount(0);
        for (let index = 2; index < 10; index++) {
          await next.click();
          await expect(heading).toHaveText(delivered[index].prompt);
          await expect(heading).toBeFocused();
          await expect(radioFor(index, responses[index])).toBeChecked();
        }

        const submission = page.waitForResponse(response =>
          new URL(response.url()).pathname === `${chapterApi}/attempts` && response.request().method() === "POST");
        await main.getByRole("button", { name: "Submit answers", exact: true }).click();
        const graded = await submission;
        expect(graded.status()).toBe(200);
        expect(graded.request().postDataJSON()).toEqual({ answers: delivered.map((question, index) => ({ questionId: question.id, response: responses[index] })) });
        const result = await graded.json();
        expect(result).toMatchObject({ score: pass ? 1 : 0, passed: pass, complete: pass });
        expect(result.answers).toHaveLength(10);
        const resultHeading = main.getByRole("heading", { name: pass ? "Chapter complete" : "Keep going", exact: true });
        await expect(resultHeading).toBeVisible();
        await expect(resultHeading).toBeFocused();
        await expect(main.getByText(pass ? "100%" : "0%", { exact: true })).toBeVisible();
        for (const response of responses) await expect(main.getByText(`Your answer: ${response}`, { exact: true })).toBeVisible();
        await expectNoOverflow(page);
        await info.attach("focused-graded-result", { body: await page.screenshot({ fullPage: true }), contentType: "image/png" });

        // Draft answers are component state; verify navigation preservation
        // above, and durable graded evidence/course status across reload here.
        await main.getByRole("link", { name: pass ? "View completed course" : "← Back to course", exact: true }).click();
        await expect(page).toHaveURL(coursePath);
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
        if (pass) await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        await page.reload();
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", pass ? "100" : "0");
        if (pass) await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        await expectNoOverflow(page);
        const saved = fixture.persisted();
        expect(saved.attempts).toHaveLength(1);
        expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: pass ? 1 : 0, passed: pass });
        expect(saved.answers).toHaveLength(10);
        for (const [index, question] of delivered.entries()) expect(saved.answers.find(answer => answer.questionId === question.id)).toMatchObject({ response: responses[index], score: pass ? 1 : 0 });
        expect(saved.chapter?.status).toBe(pass ? "passed" : "open");
        // Cache-hit observability can update independently of learning evidence.
        expect(saved.jobs).toEqual([]);
        expect(submissions).toBe(1);
        expect(unexpectedWrites).toEqual([]);
      } finally {
        try { await page.close(); } finally { fixture.cleanup(); }
      }
    });
  }
}
