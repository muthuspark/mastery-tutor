import { expect, test } from "@playwright/test";

test("appends explanation levels for a migrated mastered chapter and retains them after reload", async ({ page }) => {
  const chapter = { id: "legacy-chapter", idx: 0, title: "Separation", status: "passed", pretest: null, contentGenerationVersion: 4, contentGenerationStatus: "ready", generatedAt: "2026-10-01" };
  const sections: { id: string; ordinal: number; kind: "legacy" | "alternative"; sourceContentVersion: number; level: number | null; label: string | null; content: string; html: string }[] = [{ id: "legacy-original", ordinal: 1, kind: "legacy", sourceContentVersion: 4, level: null, label: null, content: "The original lesson stays available.", html: "<p>The original lesson stays available.</p>" }];
  let effectiveLevel = 2;
  let activeRequest: { id: string; status: "pending" | "generating"; level: number } | null = null;
  let failedRequest: { id: string; status: "failed"; level: number; jobVersion: number } | null = { id: "interrupted", status: "failed", level: 1, jobVersion: 3 };
  const acceptedRequests: { direction: string; baselineExplanationId: string; expectedContentVersion: number }[] = [];
  const quizRequests: string[] = [];

  await page.route("**/api/courses/legacy-course", route => route.fulfill({ json: { course: { topic: "Differential equations" }, chapters: [chapter] } }));
  await page.route("**/api/chapters/legacy-chapter", route => route.fulfill({ json: { chapter, html: "<p>The original lesson stays available.</p>" } }));
  await page.route("**/api/chapters/legacy-chapter/quiz", async route => { quizRequests.push(route.request().method()); await route.fulfill({ json: { questions: [] } }); });
  await page.route("**/api/chapters/legacy-chapter/explanations**", async route => {
    const request = route.request();
    if (request.method() === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      if (request.url().endsWith("/retry")) {
        failedRequest = null;
        activeRequest = { id: "retry-created", status: "pending", level: 1 };
      } else {
        acceptedRequests.push({ direction: String(body.direction), baselineExplanationId: String(body.baselineExplanationId), expectedContentVersion: Number(body.expectedContentVersion) });
        const direction = String(body.direction);
        const previous = effectiveLevel;
        effectiveLevel = direction === "deeper" ? previous + 1 : previous - 1;
        activeRequest = { id: `request-${acceptedRequests.length}`, status: "pending", level: effectiveLevel };
      }
      await route.fulfill({ status: 202, json: { id: activeRequest.id, level: activeRequest.level, status: "pending" } });
      return;
    }
    if (activeRequest) {
      const accepted = activeRequest;
      sections.push({ id: accepted.id, ordinal: sections.length + 1, kind: "alternative", sourceContentVersion: 4, level: accepted.level, label: ["", "Intuitive", "Guided", "Applied", "Technical", "Advanced", "Research"][accepted.level], content: `Explanation at level ${accepted.level}.`, html: `<p>Explanation at level ${accepted.level}.</p>` });
      effectiveLevel = accepted.level;
      activeRequest = null;
    }
    await route.fulfill({ json: { canonicalVersion: 4, baselineExplanationId: "legacy-original", effectiveLevel, legacyBaseline: true, sections, activeRequest, failedRequest } });
  });

  await page.goto("/course/legacy-course/ch/0");
  await expect(page.getByText("Depth not recorded. Adjustments start from Guided (2 of 6)." )).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Explanation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Check your understanding →" })).toBeVisible();

  await page.getByRole("button", { name: "Retry explanation" }).click();
  await expect(page.getByRole("heading", { name: "Intuitive explanation" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explanation added" })).toBeVisible();
  await page.getByRole("button", { name: "More depth" }).click();
  await expect(page.getByRole("heading", { name: "Guided explanation" }).first()).toBeVisible();
  await page.getByRole("button", { name: "More depth" }).click();
  await expect(page.getByRole("heading", { name: "Applied explanation" })).toBeVisible();
  await page.getByRole("button", { name: "Simpler" }).click();
  await expect(page.getByRole("heading", { name: "Guided explanation" })).toBeVisible();
  await expect(page.getByText("Current explanation: Guided (2 of 6)")).toBeVisible();

  expect(acceptedRequests).toEqual([
    { direction: "deeper", baselineExplanationId: "legacy-original", expectedContentVersion: 4 },
    { direction: "deeper", baselineExplanationId: "legacy-original", expectedContentVersion: 4 },
    { direction: "simpler", baselineExplanationId: "legacy-original", expectedContentVersion: 4 },
  ]);
  await expect(page.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/legacy-course/ch/0/quiz");
  expect(quizRequests).toEqual([]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Explanation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Intuitive explanation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Applied explanation" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Guided explanation" })).toHaveCount(2);
  expect(quizRequests).toEqual([]);
});
