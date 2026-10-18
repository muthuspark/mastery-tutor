import { expect, test } from "@playwright/test";

test("keeps the app header consistent across pages and quiz results", async ({ page }) => {
  const chapters = [{ id: "header-chapter", idx: 0, title: "Header chapter", status: "open" }];
  await page.route("**/api/courses/header-course", route => route.fulfill({ json: { course: { topic: "Header course" }, chapters, progress: { passed: 0, total: 1 } } }));
  await page.route("**/api/chapters/header-chapter", route => route.fulfill({ json: { chapter: { ...chapters[0], pretest: null }, html: "<p>Header lesson content</p>" } }));
  await page.route("**/api/chapters/header-chapter/quiz", route => route.fulfill({ json: { questions: [{ id: "header-question", type: "mcq", prompt: "Which answer?", options: ["First", "Second", "Third", "Fourth"], isReview: false }] } }));
  await page.route("**/api/chapters/header-chapter/attempts", route => route.fulfill({ json: { passed: true, score: 1, answers: [] } }));

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const header = page.locator("body > .site-header");
    const expected = await header.boundingBox();
    const brand = header.getByRole("link", { name: "Mastery Tutor" });
    const expectedBrand = await brand.boundingBox();
    for (const path of ["/settings", "/course/header-course", "/course/header-course/ch/0", "/course/header-course/ch/0/quiz"]) {
      await page.goto(path);
      await expect(header).toBeVisible();
      await expect(page.getByRole("link", { name: "Mastery Tutor", exact: true })).toHaveCount(1);
      expect(await header.boundingBox()).toEqual(expected);
      expect(await brand.boundingBox()).toEqual(expectedBrand);
      await expect(header.getByRole("link", { name: "Profile settings" })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.getByRole("radio").first().check();
    await page.getByRole("button", { name: "Submit answers" }).click();
    await expect(page.getByRole("heading", { name: "Chapter complete" })).toBeVisible();
    expect(await header.boundingBox()).toEqual(expected);
  }
});
