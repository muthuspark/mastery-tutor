import { expect, test } from "@playwright/test";
import type { SocraticSessionView } from "../lib/socratic-contracts";

for (const width of [1440, 390]) {
  test(`guided practice supports keyboard choices, hints, resume, and the quiz at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const chapter = { id: "practice-chapter", idx: 0, title: "Database indexes", status: "passed", pretest: null, contentGenerationVersion: 1 };
    await page.route("**/api/courses/practice-course", route => route.fulfill({ json: { course: { topic: "Databases" }, chapters: [chapter] } }));
    await page.route("**/api/chapters/practice-chapter", route => route.fulfill({ json: { chapter, html: "<p>An index helps locate records without searching every row.</p>" } }));
    const prompts = ["How can you find a record without reading every row?", "What happens when an indexed value changes?", "Why might an extra index slow down writes?"];
    let session: SocraticSessionView = { id: "session", question: { id: "question-0", setup: "A lookup list points from a value to the rows containing it.", prompt: prompts[0], options: ["Use an index to locate it", "Duplicate every row", "Read all rows twice"], hint: "Think about how you use an index in a book." }, turns: [], summary: null };
    const requests: Record<string, unknown>[] = [];
    await page.route("**/api/chapters/practice-chapter/socratic", async route => {
      const input = route.request().postDataJSON();
      requests.push(input);
      if (input.action === "answer") {
        const previous = session.question!;
        session.turns.push({ prompt: previous.prompt, response: previous.options[input.choiceIndex] ?? "I'm not sure", correct: true, usedHint: input.usedHint, feedback: "You connected the lookup structure to the work it saves." });
        const count = session.turns.length;
        session = { ...session, question: count < 3 ? { ...previous, id: `question-${count}`, prompt: prompts[count] } : null, summary: count === 3 ? "An index reduces lookup work, but changes to indexed data also require maintaining the index." : null };
      }
      await route.fulfill({ json: session });
    });
    await page.goto("/course/practice-course/ch/0");
    await expect(page.getByRole("region", { name: "Chapter practice" })).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole("button", { name: "Start or resume practice" }).click();
    await expect(page.getByRole("heading", { name: prompts[0] })).toBeFocused();
    await expect(page.getByRole("heading", { name: prompts[0] })).toHaveAccessibleDescription(session.question!.setup!);
    await page.getByRole("button", { name: "Give me a hint" }).click();
    await expect(page.getByRole("region", { name: "Chapter practice" }).getByRole("status")).toContainText("Think about how you use an index");
    const choice = page.getByRole("radio", { name: "A. Use an index to locate it" });
    await choice.focus();
    await page.keyboard.press("Space");
    await expect(choice).toBeChecked();
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    await expect(page.getByRole("heading", { name: prompts[1] })).toBeFocused();
    expect(requests[1]).toMatchObject({ choiceIndex: 0, usedHint: true });
    await page.reload();
    await page.getByRole("button", { name: "Start or resume practice" }).click();
    await expect(page.getByRole("heading", { name: prompts[1] })).toBeVisible();
    for (let index = 1; index < 3; index++) {
      await page.getByRole("radio", { name: "A. Use an index to locate it" }).check();
      await page.getByRole("button", { name: "Continue", exact: true }).click();
      await expect(page.getByRole("heading", { name: index === 2 ? "Putting it together" : prompts[index + 1] })).toBeFocused();
    }
    await expect(page.getByRole("button", { name: "Try another guided session" })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Check your understanding →" })).toHaveAttribute("href", "/course/practice-course/ch/0/quiz");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".socratic-session").screenshot({ path: test.info().outputPath(`guided-practice-${width}.png`) });
  });
}
