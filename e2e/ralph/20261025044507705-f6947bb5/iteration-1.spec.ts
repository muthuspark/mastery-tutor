import { expect, test, type Page } from "@playwright/test";

type SavedCourse = {
  id: string;
  topic: string;
  preparationStatus?: string;
  progress: { passed: number; total: number };
};

// Read-only regression smoke. This checkout has no explicit-owner migration:
// this test cannot prove assignment, backups, rollback, or migration reruns.
// Do not migrate the running database or modify existing learner records here.
async function expectSavedStudies(page: Page, courses: SavedCourse[]) {
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Your learning workspace", exact: true })).toBeVisible();
  const studies = main.getByRole("region", { name: "Your studies", exact: true });
  await expect(studies.getByText(`${courses.length} ${courses.length === 1 ? "subject" : "subjects"}`, { exact: true })).toBeVisible();
  await expect(studies.getByRole("link")).toHaveCount(courses.length);
  if (courses.length === 0) {
    await expect(studies.getByText("Choose a topic to start your first study. Your saved studies and progress will appear here.", { exact: true })).toBeVisible();
  }
  for (const course of courses) {
    const card = studies.locator(`a[href="/course/${course.id}"]`);
    await expect(card).toHaveAttribute("href", `/course/${course.id}`);
    await expect(card.getByRole("heading", { name: course.topic, exact: true })).toBeVisible();
    if (course.preparationStatus && course.preparationStatus !== "ready") {
      await expect(card.getByText(course.preparationStatus === "failed" ? "Preparation needs attention" : "Preparing your course", { exact: true })).toBeVisible();
    } else {
      const { passed, total } = course.progress;
      const progress = card.getByRole("progressbar", { name: `${course.topic} progress`, exact: true });
      await expect(card.getByText(`${passed} of ${total} chapters mastered`, { exact: true })).toBeVisible();
      await expect(progress).toHaveAttribute("aria-valuenow", String(total ? Math.round(passed / total * 100) : 0));
      await expect(progress).toHaveAttribute("aria-valuetext", `${passed} of ${total} chapters mastered`);
    }
  }
  await expect(main.getByRole("button", { name: "Create study →", exact: true })).toBeVisible();
}

test("read-only smoke: saved studies render real progress after reload and settings navigation", async ({ page }) => {
  const coursesResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/courses" && response.request().method() === "GET",
  );
  await page.goto("/");
  const response = await coursesResponse;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(Array.isArray(body.courses)).toBe(true);
  const courses: SavedCourse[] = body.courses;
  await expectSavedStudies(page, courses);

  // A full reload must retrieve persisted courses rather than rely on query cache.
  const reloadResponse = page.waitForResponse(response =>
    new URL(response.url()).pathname === "/api/courses" && response.request().method() === "GET",
  );
  await page.reload();
  expect((await reloadResponse).ok()).toBe(true);
  await expectSavedStudies(page, courses);

  await page.getByRole("link", { name: "Profile settings", exact: true }).click();
  const main = page.getByRole("main");
  await expect(main.getByRole("heading", { name: "Profile settings", exact: true })).toBeVisible();
  await expect(main.getByLabel(/About me/)).toBeEnabled();
  await page.reload();
  await expect(main.getByLabel(/About me/)).toBeEnabled();
  await main.getByRole("link", { name: "Back to learning", exact: true }).click();
  await expectSavedStudies(page, courses);
});
