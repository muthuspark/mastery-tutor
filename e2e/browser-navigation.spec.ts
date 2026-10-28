import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`browser history and the home logo connect learning pages at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const chapter = { id: "navigation-chapter", idx: 0, title: "Sharing a core", status: "open", pretest: null, contentGenerationVersion: 1, contentGenerationStatus: "ready" };
    const course = { id: "navigation-course", topic: "Operating Systems", createdAt: "2026-10-01", startedAt: "2026-10-02", preparationStatus: "ready", progress: { passed: 0, total: 1 } };
    await page.route("**/api/courses", route => route.fulfill({ json: { courses: [course] } }));
    await page.route("**/api/courses/navigation-course", route => route.fulfill({ json: { course, chapters: [chapter], progress: course.progress } }));
    await page.route("**/api/chapters/navigation-chapter", route => route.fulfill({ json: { chapter, html: "<p>The scheduler gives runnable threads a turn.</p>" } }));
    await page.route("**/api/chapters/navigation-chapter/explanations", route => route.fulfill({ json: { canonicalVersion: 1, effectiveLevel: 2, legacyBaseline: true, sections: [], activeRequest: null, failedRequest: null } }));
    await page.route("**/api/chapters/navigation-chapter/socratic", route => route.fulfill({ json: { id: "practice", question: null, turns: [], summary: null } }));
    await page.route("**/api/chapters/navigation-chapter/quiz", route => route.fulfill({ json: { questions: [{ id: "question", type: "mcq", prompt: "Which thread can run?", options: ["A runnable thread", "A blocked thread"], isReview: false }] } }));
    await page.route("**/api/profile", route => route.fulfill({ json: { aboutMe: "" } }));

    await page.goto("/");
    await page.getByRole("link", { name: "Continue studying →", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: course.topic })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Sharing a core Continue →", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: chapter.title })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
    await page.getByRole("link", { name: "Check your understanding →" }).click();
    await expect(page.getByRole("heading", { name: "Which thread can run?" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);

    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: chapter.title })).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("heading", { name: "Which thread can run?" })).toBeVisible();
    await page.goBack();
    await page.goBack();
    await expect(page.getByRole("heading", { level: 1, name: course.topic })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Your learning workspace" })).toBeVisible();

    await page.getByRole("link", { name: "Profile settings", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Profile settings" })).toBeVisible();
    await expect(page.getByRole("link", { name: /^Back to/ })).toHaveCount(0);
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Your learning workspace" })).toBeVisible();

    // A direct chapter entry still has an explicit, history-independent home exit.
    await page.goto("/course/navigation-course/ch/0");
    await page.getByRole("link", { name: "Newton", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Your learning workspace" })).toBeVisible();
  });
}
