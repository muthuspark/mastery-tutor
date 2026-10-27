import { expect, test } from "@playwright/test";
import { writeFileSync } from "node:fs";

test("crawls page families and checks the shared visual system", async ({ page }) => {
  test.setTimeout(90_000);
  const chapters = [
    { id: "style-passed", idx: 0, title: "Foundations", status: "passed", prerequisites: [] },
    { id: "style-open", idx: 1, title: "Understanding probability", status: "open", prerequisites: [] },
    { id: "style-locked", idx: 2, title: "Applying the idea", status: "locked", prerequisites: [0] },
  ];
  const question = { id: "style-question", type: "mcq", prompt: "Which outcome is possible?", options: ["The first outcome", "The second outcome"], isReview: false };
  const lesson = { chapter: { ...chapters[1], pretest: null, contentGenerationVersion: 1, contentGenerationStatus: "ready" }, html: "<h2>Start with what you know</h2><p>Use the information you have to narrow the possible outcomes.</p>" };
  await page.route("**/api/courses", route => route.fulfill({ json: { courses: [{ id: "style-ready", topic: "Probability", createdAt: "2026-10-01", preparationStatus: "ready", progress: { passed: 1, total: 3 } }] } }));
  await page.route("**/api/courses/style-*", route => {
    const id = new URL(route.request().url()).pathname.split("/").at(-1);
    return route.fulfill({ json: { course: { topic: "Probability", preparationStatus: id === "style-pending" ? "generating" : id === "style-failed" ? "failed" : "ready" }, chapters: id === "style-empty" ? [] : chapters, progress: { passed: 1, total: 3 } } });
  });
  await page.route("**/api/profile", route => route.fulfill({ json: { aboutMe: "I learn with practical examples." } }));
  await page.route("**/api/chapters/style-open", route => route.fulfill({ json: lesson }));
  await page.route("**/api/chapters/style-open/explanations", route => route.fulfill({ json: { canonicalVersion: 1, baselineExplanationId: "original", effectiveLevel: 2, legacyBaseline: false, sections: [], activeRequest: null, failedRequest: null } }));
  await page.route("**/api/chapters/style-open/socratic", route => route.fulfill({ json: { id: "style-practice", question: null, turns: [], summary: "You have explored the key ideas." } }));
  await page.route("**/api/chapters/style-open/quiz", route => route.fulfill({ json: { questions: [question] } }));
  await page.route("**/api/chapters/style-open/attempts", route => route.fulfill({ json: { passed: true, score: 1, complete: false, nextChapterIdx: 2, answers: [{ prompt: question.prompt, response: question.options[0], score: 1, feedback: "You identified a possible outcome.", modelAnswer: question.options[0], missedConcept: null }] } }));
  const routes = [
    ["studies", "/", "Your learning workspace"],
    ["settings", "/settings", "Profile settings"],
    ["course", "/course/style-ready", "Probability"],
    ["course-empty", "/course/style-empty", "Probability"],
    ["course-preparing", "/course/style-pending", "Preparing your course"],
    ["course-failed", "/course/style-failed", "Could not prepare your course"],
    ["chapter", "/course/style-ready/ch/1", "Understanding probability"],
    ["chapter-unavailable", "/course/style-empty/ch/0", "Chapter unavailable"],
    ["quiz", "/course/style-ready/ch/1/quiz", question.prompt],
    ["quiz-locked", "/course/style-ready/ch/2/quiz", "QnA unavailable"],
    ["not-found", "/style-page-that-does-not-exist", ""],
  ];
  const records: Record<string, unknown>[] = [];
  async function inspect(name: string, width: number) {
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(() => window.scrollTo(0, 0));
    const styles = await page.evaluate(() => {
      const header = document.querySelector("body > .site-header")!;
      const heading = document.querySelector("main h1, h1");
      const footer = document.querySelector("body > .site-footer")!;
      const button = document.querySelector("main .button-primary");
      return {
        background: getComputedStyle(document.body).backgroundColor,
        bodyFont: getComputedStyle(document.body).fontFamily,
        headingFont: heading ? getComputedStyle(heading).fontFamily : null,
        header: { x: header.getBoundingClientRect().x, width: header.getBoundingClientRect().width, height: header.getBoundingClientRect().height, font: getComputedStyle(header.querySelector(".site-brand")!).fontFamily },
        footerBackground: getComputedStyle(footer).backgroundColor,
        buttonRadius: button ? getComputedStyle(button).borderRadius : null,
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    records.push({ page: name, width, ...styles });
    await page.screenshot({ path: `test-results/style-audit/${name}-${width}.png`, fullPage: true });
    return styles;
  }
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    let referenceHeader: Awaited<ReturnType<typeof inspect>>["header"] | undefined;
    for (const [name, path, title] of routes) {
      await page.goto(path);
      if (title) await expect(page.getByRole("heading", { level: 1, name: title, exact: true })).toBeVisible();
      const styles = await inspect(name, width);
      referenceHeader ??= styles.header;
      if (!process.env.STYLE_AUDIT_BASELINE) {
        expect(styles.background, name).toBe("rgb(255, 255, 255)");
        expect(styles.bodyFont, name).toContain("EB Garamond");
        expect(styles.headingFont, name).toContain("Roboto Condensed");
        expect(styles.header, name).toEqual(referenceHeader);
        expect(styles.footerBackground, name).toBe("rgba(0, 0, 0, 0)");
        expect(styles.overflow, name).toBe(false);
        if (styles.buttonRadius !== null) expect(styles.buttonRadius, name).toBe("0px");
      }
      if (name === "quiz") {
        await page.getByRole("radio").first().check();
        await page.getByRole("button", { name: "Submit answers" }).click();
        await expect(page.getByRole("heading", { name: "Chapter complete" })).toBeVisible();
        const result = await inspect("quiz-result", width);
        if (!process.env.STYLE_AUDIT_BASELINE) {
          expect(result.bodyFont).toContain("EB Garamond");
          expect(result.headingFont).toContain("Roboto Condensed");
          expect(result.header).toEqual(referenceHeader);
          expect(result.overflow).toBe(false);
        }
      }
    }
  }
  writeFileSync("test-results/style-audit.json", JSON.stringify(records, null, 2));
});

test("login retains its approved pixel typography within the white visual system", async ({ browser }) => {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.route("**/api/auth/email-otp/send-verification-otp", route => route.fulfill({ json: { success: true } }));
  await page.goto("/login");
  await expect(page.getByLabel("Email address")).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const styles = await page.evaluate(() => ({ background: getComputedStyle(document.body).backgroundColor, font: getComputedStyle(document.querySelector("h1")!).fontFamily, bodyFont: getComputedStyle(document.body).fontFamily, overflow: document.documentElement.scrollWidth > innerWidth }));
    expect(styles.background).toBe("rgb(255, 255, 255)");
    expect(styles.font).toContain("Newton Pixel");
    expect(styles.bodyFont).toContain("EB Garamond");
    expect(styles.overflow).toBe(false);
    await page.screenshot({ path: `test-results/style-audit/login-${width}.png`, fullPage: true });
  }
  await page.getByLabel("Email address").fill("learner@example.com");
  await page.getByRole("button", { name: "Email me a code" }).click();
  await expect(page.getByLabel("Login code")).toBeFocused();
  await page.screenshot({ path: "test-results/style-audit/login-code-320.png", fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await context.close();
});
