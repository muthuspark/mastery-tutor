import { expect, test, type Locator, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import path from "node:path";
import { isBalancedQuiz } from "../../../lib/assessment-quality";
import { questions } from "../../../lib/db/schema";
import { preparedMcqFixture } from "../fixtures";

const longAnswers = [
  "Repeated retrieval and spaced practice help learners apply ideas in unfamiliar situations and check their reasoning. ".repeat(5).trim(),
  `https://example.test/feedback/${"long-path-segment".repeat(20)}?context=practice`,
  "UninterruptedAnswerToken".repeat(20),
];

async function expectContainedText(locator: Locator) {
  await expect(locator).toBeVisible();
  const geometry = await locator.evaluate(element => {
    const rect = element.getBoundingClientRect();
    const range = document.createRange();
    range.selectNodeContents(element);
    return {
      width: rect.width,
      overflow: element.scrollWidth - element.clientWidth,
      ellipsis: getComputedStyle(element).textOverflow === "ellipsis",
      fragmentsFit: [...range.getClientRects()].every(fragment =>
        fragment.left >= rect.left - 1 && fragment.right <= rect.right + 1 &&
        fragment.top >= rect.top - 3 && fragment.bottom <= rect.bottom + 3),
    };
  });
  expect(geometry.width).toBeGreaterThan(0);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.ellipsis).toBe(false);
  expect(geometry.fragmentsFit, "Full answer text must wrap inside its paragraph without clipping").toBe(true);
}

async function expectReadingGeometry(page: Page, width: number) {
  const geometry = await page.getByRole("main").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return {
      width: rect.width, left: rect.left, right: rect.right,
      overflow: element.scrollWidth - element.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  const expectedWidth = Math.min(width - (width < 768 ? 32 : 48), 768);
  expect(geometry.width).toBeCloseTo(expectedWidth, 0);
  expect(geometry.left).toBeCloseTo((width - expectedWidth) / 2, 0);
  expect(geometry.right).toBeCloseTo(width - geometry.left, 0);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
}

async function expectBodyTypography(paragraph: Locator) {
  const style = await paragraph.evaluate(element => {
    const computed = getComputedStyle(element);
    return { size: parseFloat(computed.fontSize), lineHeight: parseFloat(computed.lineHeight) };
  });
  expect(style.size).toBe(18);
  expect(style.lineHeight).toBeCloseTo(29.7, 1);
  await expectContainedText(paragraph);
}

for (const width of [375, 768, 1440]) {
  for (const pass of [true, false]) {
    test(`${pass ? "passing with corrections" : "failing"} result is readable and durable at ${width}px`, async ({ page, request }, info) => {
      await page.setViewportSize({ width, height: 900 });
      const fixture = preparedMcqFixture();
      try {
        // Only this test's UUID-owned questions change. Keep the original
        // correct-position distribution while exercising prose, URLs and tokens.
        const cases = fixture.questions.map((question, index) => {
          if (index < 7) return question;
          const options = Array.from({ length: 4 }, (_, option) => `Choice ${option + 1}: ${longAnswers[9 - index]}`);
          return { ...question, options, modelAnswer: options[index % 4] };
        });
        expect(isBalancedQuiz(cases), "All ten base questions must remain balanced before navigation").toBe(true);
        const configured = process.env.DATABASE_URL?.replace(/^file:/, "");
        const databasePath = process.env.RALPH_TEST_DATABASE ?? path.join(process.cwd(), "data", configured ? path.basename(configured) : "tutor.db");
        const sqlite = new Database(databasePath, { fileMustExist: true });
        try {
          sqlite.pragma("foreign_keys = ON");
          sqlite.pragma("busy_timeout = 5000");
          const db = drizzle(sqlite);
          db.transaction(tx => {
            for (const question of cases) {
              const updated = tx.update(questions).set({ options: question.options, modelAnswer: question.modelAnswer })
                .where(and(eq(questions.id, question.id), eq(questions.chapterId, fixture.chapterId))).run();
              expect(updated.changes).toBe(1);
            }
          });
          const stored = db.select().from(questions).where(eq(questions.chapterId, fixture.chapterId)).all();
          expect(stored).toHaveLength(10);
          expect(isBalancedQuiz(stored.map(question => ({ ...question, options: question.options ?? [] })))).toBe(true);
        } finally { sqlite.close(); }

        const coursePath = `/course/${fixture.courseId}`;
        const chapterPath = `${coursePath}/ch/0`;
        const chapterApi = `/api/chapters/${fixture.chapterId}`;
        const visible = await request.get(`/api/courses/${fixture.courseId}`);
        expect(visible.status(), "Existing server must see the fixture; set RALPH_TEST_DATABASE if needed").toBe(200);
        const course = await visible.json();
        let submissions = 0;
        const unexpectedWrites: string[] = [];
        await page.route("**/api/**", async route => {
          const req = route.request();
          const pathname = new URL(req.url()).pathname;
          if (req.method() === "POST" && pathname === `${chapterApi}/attempts` && submissions === 0) {
            submissions += 1;
            await route.continue(); // Real MCQ grading and SQLite persistence.
          } else if (req.method() !== "GET") {
            unexpectedWrites.push(`${req.method()} ${pathname}`);
            await route.abort("blockedbyclient");
          } else if (pathname === `${chapterApi}/quiz` && submissions > 0) {
            // Review chapter intentionally prefetches a fresh quiz after a
            // failure. Isolate regeneration, including automatic prefetches.
            await route.fulfill({ status: 503, json: { error: { message: "Fresh quiz generation is outside this test.", retryable: false } } });
          } else await route.continue();
        });

        const delivered = [...cases].reverse();
        // Passing at 80% still needs corrective feedback for the long prose and
        // URL answers. Failure exercises all three long feedback variants.
        const scores = delivered.map((_, index) => pass && index >= 2 ? 1 : 0);
        const responses = delivered.map((question, index) => {
          const correct = question.options.indexOf(question.modelAnswer);
          return question.options[(correct + (scores[index] ? 0 : 1)) % 4];
        });
        const delivery = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/quiz` && response.request().method() === "GET");
        await page.goto(`${chapterPath}/quiz`);
        const quiz = await delivery;
        expect(quiz.status()).toBe(200);
        expect(await quiz.json()).toEqual({ questions: delivered.map(({ id, type, prompt, options, isReview }) => ({ id, type, prompt, options, isReview })) });
        const main = page.getByRole("main");
        const prompt = main.getByRole("heading", { level: 1 });
        await expect(prompt).toHaveText(delivered[0].prompt);
        const promptSize = await prompt.evaluate(element => parseFloat(getComputedStyle(element).fontSize));
        expect(promptSize).toBe(width < 768 ? 36 : 48);
        for (const [index, question] of delivered.entries()) {
          await expect(prompt).toHaveText(question.prompt);
          const position = question.options.indexOf(responses[index]);
          const radio = main.getByRole("radiogroup", { name: question.prompt, exact: true })
            .getByRole("radio", { name: `${String.fromCharCode(65 + position)}. ${responses[index]}`, exact: true });
          await radio.check();
          await expect(radio).toBeChecked();
          if (index < 9) await main.getByRole("button", { name: "Next question", exact: true }).click();
        }
        const submission = page.waitForResponse(response => new URL(response.url()).pathname === `${chapterApi}/attempts` && response.request().method() === "POST");
        await main.getByRole("button", { name: "Submit answers", exact: true }).click();
        const graded = await submission;
        expect(graded.status()).toBe(200);
        expect(graded.request().postDataJSON()).toEqual({ answers: delivered.map((question, index) => ({ questionId: question.id, response: responses[index] })) });
        const result = await graded.json();
        expect(result).toMatchObject({ score: pass ? 0.8 : 0, passed: pass, complete: pass });
        expect(result.answers).toHaveLength(10);
        const heading = main.getByRole("heading", { level: 1, name: pass ? "Chapter complete" : "Keep going", exact: true });
        await expect(heading).toBeVisible();
        await expect(heading).toBeFocused();
        const score = main.getByText(pass ? "80%" : "0%", { exact: true });
        await expect(score).toBeVisible();
        for (const title of [heading, score]) {
          expect(await title.evaluate(element => parseFloat(getComputedStyle(element).fontSize))).toBe(promptSize);
          await expectContainedText(title);
        }
        await expectReadingGeometry(page, width);
        await heading.scrollIntoViewIfNeeded();
        await info.attach("result-heading-and-score", { body: await page.screenshot(), contentType: "image/png" });

        const missed = delivered.filter((_, index) => !scores[index]).map(question => question.conceptTag);
        const concepts = main.getByRole("region", { name: "Concepts to revisit", exact: true });
        await expect(concepts.getByRole("listitem")).toHaveText(missed);
        await expectBodyTypography(concepts.locator("p"));
        const remediation = main.getByRole("region", { name: "Before trying again", exact: true });
        if (pass) await expect(remediation).toHaveCount(0);
        else {
          await expect(remediation.locator("p")).toHaveText(`Review these concepts before trying again: ${missed.join(", ")}.`);
          await expectBodyTypography(remediation.locator("p"));
        }
        for (const [index, question] of delivered.entries()) {
          const feedback = scores[index] ? "Correct." : `The expected answer is: ${question.modelAnswer}.`;
          expect(result.answers[index]).toMatchObject({ questionId: question.id, response: responses[index], modelAnswer: question.modelAnswer, feedback, score: scores[index] });
          const answer = main.getByRole("heading", { level: 2, name: `${index + 1}. ${question.prompt}`, exact: true }).locator("..");
          const paragraphs = answer.locator("p");
          await expect(paragraphs).toHaveCount(3);
          for (const [offset, label, content] of [
            [0, "Your answer:", responses[index]],
            [1, "Feedback:", feedback],
            [2, "Model answer:", question.modelAnswer],
          ] as const) {
            const paragraph = paragraphs.nth(offset);
            await expect(paragraph).toHaveText(`${label} ${content}`);
            await expect(paragraph.locator("span")).toHaveText(label);
            await expectBodyTypography(paragraph);
          }
          const gaps = await paragraphs.evaluateAll(elements => elements.slice(1).map((element, offset) =>
            element.getBoundingClientRect().top - elements[offset].getBoundingClientRect().bottom));
          for (const gap of gaps) expect(gap).toBeCloseTo(16, 0);
          if (index < 3) {
            await answer.scrollIntoViewIfNeeded();
            await info.attach(`answer-comparison-${["prose", "url", "token"][index]}`, { body: await page.screenshot(), contentType: "image/png" });
          }
        }
        await expectReadingGeometry(page, width);
        const primary = main.getByRole("link", { name: pass ? "View completed course" : "Try again", exact: true });
        await expect(primary).toHaveAttribute("href", pass ? coursePath : `${chapterPath}/quiz`);
        const review = main.getByRole("link", { name: "Review chapter", exact: true });
        await expect(review).toHaveAttribute("href", chapterPath);
        if (!pass) {
          // Actually follow the recovery reading path, allowing its normal
          // background prefetch while keeping generation isolated above.
          await review.click();
          await expect(page).toHaveURL(chapterPath);
          await expect(main.getByText("Test-owned prepared lesson", { exact: true })).toBeVisible();
          await expectReadingGeometry(page, width);
          await main.getByRole("link", { name: "← Back to course", exact: true }).click();
        } else await primary.click();
        await expect(page).toHaveURL(coursePath);
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
        if (pass) await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        // Result state is local; durable evidence is the saved attempt, answer
        // comparisons and chapter status, checked after course reload.
        await page.reload();
        await expect(main.getByRole("heading", { level: 1 })).toHaveText(course.course.topic);
        await expect(main.getByRole("progressbar", { name: "Course mastery", exact: true })).toHaveAttribute("aria-valuenow", pass ? "100" : "0");
        if (pass) await expect(main.getByText("You completed this course.", { exact: true })).toBeVisible();
        const saved = fixture.persisted();
        expect(saved.attempts).toHaveLength(1);
        expect(saved.attempts[0]).toMatchObject({ id: result.attemptId, score: pass ? 0.8 : 0, passed: pass });
        expect(saved.answers).toHaveLength(10);
        for (const [index, question] of delivered.entries()) {
          expect(saved.answers.find(answer => answer.questionId === question.id)).toMatchObject({
            response: responses[index], score: scores[index], feedback: result.answers[index].feedback,
          });
        }
        expect(saved.chapter?.status).toBe(pass ? "passed" : "open");
        // Generation-cache metadata may change on reads; learning evidence
        // above must survive independently, with no generation jobs created.
        expect(saved.jobs).toEqual([]);
        expect(submissions).toBe(1);
        expect(unexpectedWrites).toEqual([]);
      } finally {
        try { await page.close(); } finally { fixture.cleanup(); }
      }
    });
  }
}
