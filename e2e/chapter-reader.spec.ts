import { expect, test } from "@playwright/test";

test("chapter reading keeps navigation, practice, and lesson text usable across screen sizes", async ({ page }) => {
  const chapters = [
    { id: "reader-intro", idx: 0, title: "The language of probability", status: "passed" },
    { id: "reader-current", idx: 1, title: "Understanding conditional probability", status: "open" },
    { id: "reader-next", idx: 2, title: "Independent events and their relationships", status: "locked" },
    { id: "reader-bayes", idx: 3, title: "Bayes’ theorem", status: "locked" },
  ];
  const chapter = { ...chapters[1], pretest: null, contentGenerationVersion: 1, contentGenerationStatus: "ready" };
  const html = "<h2>A little context changes everything</h2><p>Conditional probability describes how likely an event is when you know that another event has already happened.</p><p>Imagine drawing a card from a deck. Knowing that the card is red changes the set of possible outcomes. You now have a smaller space to reason about.</p><h3>Start with what you know</h3><p>Focus on the outcomes that satisfy your condition, then ask how many of those outcomes also satisfy the event you care about.</p><blockquote><p>The condition changes the sample space.</p></blockquote>";
  await page.route("**/api/courses/reader-course", route => route.fulfill({ json: { course: { topic: "Conditional Probability" }, chapters } }));
  await page.route("**/api/chapters/reader-current", route => route.fulfill({ json: { chapter, html } }));
  await page.route("**/api/chapters/reader-current/quiz", route => route.fulfill({ json: { questions: [] } }));
  await page.route("**/api/chapters/reader-current/explanations", route => route.fulfill({ json: {
    canonicalVersion: 1, baselineExplanationId: "original", effectiveLevel: 2, legacyBaseline: false,
    sections: [{ id: "original", ordinal: 1, kind: "original", sourceContentVersion: 1, level: 2, label: "Guided", html }],
    activeRequest: null, failedRequest: null,
  } }));
  await page.route("**/api/chapters/reader-current/socratic", route => route.fulfill({ json: {
    id: "reader-practice", turns: [], summary: null,
    question: { id: "reader-question", setup: "You draw one card from a standard deck. You already know that it is red.", prompt: "How many cards are still possible?", options: ["52 cards", "26 cards", "13 cards"], hint: "Count only the hearts and diamonds." },
  } }));
  await page.goto("/course/reader-course/ch/1");
  await expect(page.getByRole("heading", { name: "How many cards are still possible?" })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  await expect(page.getByRole("complementary", { name: "Course outline" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Course chapters" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
  await expect(page.locator(".reader-title-row")).toContainText(chapter.title);
  await expect(page.getByText("Explore the idea. Put your understanding into practice.")).toHaveCount(0);
  await expect(page.locator(".socratic-session")).toHaveCSS("border-top-width", "0px");
  await expect(page.locator(".assessment-option").first()).toHaveCSS("border-right-width", "0px");
  for (const [width, height] of [[1440, 1000], [768, 1024], [390, 844], [360, 740], [320, 667], [667, 320]]) {
    await page.setViewportSize({ width, height });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px reading layout`).toBe(true);
    await expect(page.getByRole("heading", { level: 1, name: chapter.title })).toBeVisible();
    await expect(page.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/reader-course/ch/1/quiz");
    if (width < 768) {
      const shell = await page.locator(".chapter-reader").boundingBox();
      const practice = await page.locator(".socratic-session").boundingBox();
      const lesson = await page.locator(".prose-editorial").boundingBox();
      expect(practice!.x).toBeCloseTo(shell!.x, 0);
      expect(practice!.width).toBeCloseTo(shell!.width, 0);
      expect(lesson!.x).toBeCloseTo(shell!.x, 0);
      await expect(page.locator(".assessment-option").first()).toHaveCSS("font-size", "16px");
    }
    if (width === 1440 || width === 390) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: `test-results/chapter-reader-${width}.png`, fullPage: true });
    }
  }
  await page.getByLabel("A. 52 cards").check();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
  await expect(page.locator(".assessment-option").first()).not.toHaveCSS("box-shadow", "none");
  await page.getByRole("button", { name: "Give me a hint" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Count only the hearts and diamonds." })).toBeVisible();
});
