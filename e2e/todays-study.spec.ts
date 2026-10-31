import { expect, test, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
const filename = "data/login-e2e.db";
function seed() {
  const sqlite = new Database(filename);
  sqlite.pragma("foreign_keys = ON");
  const user = sqlite
    .prepare("SELECT id FROM user WHERE email='owner@example.com'")
    .get() as { id: string };
  const course = `today-${randomUUID()}`,
    next = `today-${randomUUID()}`,
    chapter = `${course}-chapter`,
    nextChapter = `${next}-chapter`,
    now = Date.now();
  sqlite.prepare("DELETE FROM study_preferences WHERE user_id=?").run(user.id);
  sqlite
    .prepare(
      "INSERT INTO courses(id,user_id,topic,created_at,started_at,completed_at) VALUES (?,?,?, ?,?,?)",
    )
    .run(course, user.id, "Today Probability", now, now, now);
  sqlite
    .prepare(
      "INSERT INTO chapters(id,course_id,idx,title,objectives,prerequisites,status,content,content_generation_status,created_at) VALUES (?,?,0,'Events','[]','[]','passed','An event is a set of outcomes.','ready',?)",
    )
    .run(chapter, course, now);
  for (let i = 0; i < 6; i++)
    sqlite
      .prepare(
        "INSERT INTO questions(id,chapter_id,type,prompt,options,rubric,model_answer,concept_tag,created_at) VALUES (?,?,'mcq',?,'[\"A set of outcomes\",\"An equation\",\"A unit\",\"A number\"]','An event is a set of outcomes.','A set of outcomes',?,?)",
      )
      .run(
        randomUUID(),
        chapter,
        `What is an event (${i + 1})?`,
        `Event ${i + 1}`,
        now,
      );
  sqlite
    .prepare(
      "INSERT INTO courses(id,user_id,topic,created_at,started_at) VALUES (?,?,?,?,?)",
    )
    .run(next, user.id, "Today next lesson", now, now);
  sqlite
    .prepare(
      "INSERT INTO chapters(id,course_id,idx,title,objectives,prerequisites,status,content,content_generation_status,quiz_generation_status,quiz_generation_version,generated_at,created_at) VALUES (?,?,0,'Conditional events','[]','[]','open','An event is a set of outcomes.','ready','ready',1,?,?)",
    )
    .run(nextChapter, next, now, now);
  for (let i = 0; i < 10; i++)
    sqlite
      .prepare(
        "INSERT INTO questions(id,chapter_id,type,prompt,options,rubric,model_answer,concept_tag,created_at) VALUES (?,?,'mcq',?,'[\"Yes\",\"No\",\"Maybe\",\"Unknown\"]','Fixture.',?,'conditional',?)",
      )
      .run(
        randomUUID(),
        nextChapter,
        `Conditional question ${i}`,
        ["Yes", "No", "Maybe", "Unknown"][i % 4],
        now,
      );
  sqlite.close();
  return { course, next, chapter, userId: user.id };
}
async function answer(page: Page) {
  const first = page.getByRole("group").first().getByLabel("A set of outcomes", { exact: true });
  await first.focus();
  await first.press("Space");
  await expect(first).toBeChecked();
  for (const group of await page.getByRole("group").all())
    await group.getByLabel("A set of outcomes", { exact: true }).check();
  await page
    .getByRole("button", { name: "Submit review", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Review complete" }),
  ).toBeVisible();
}
for (const width of [1440, 390, 320])
  test(`persisted calendar review at ${width}px`, async ({ page }) => {
    const fixture = seed();
    await page.setViewportSize({ width, height: 900 });
    try {
      await page.goto("/");
      await expect(
        page.getByRole("heading", { name: "Today’s study" }),
      ).toBeVisible();
      await page.getByLabel("Review time zone", { exact: true }).fill("UTC");
      await page.getByRole("button", { name: "Save review time zone" }).click();
      await expect(
        page.getByText("6 concepts are due. This batch includes up to five."),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: "Continue lesson", exact: true }),
      ).toHaveAttribute("href", `/course/${fixture.next}/ch/0`);
      await page.screenshot({
        path: `test-results/todays-study-${width}.png`,
        fullPage: true,
      });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Start review", exact: true })
        .click();
      await expect(page.getByRole("group")).toHaveCount(5);
      await page
        .getByRole("button", { name: "Submit review", exact: true })
        .click();
      await expect(page.getByRole("main").getByRole("alert")).toContainText(
        "Answer question 1",
      );
      await page.reload();
      await expect(page.getByRole("group")).toHaveCount(5);
      await answer(page);
      const id = page.url().split("/").at(-1)!;
      await page.reload();
      await expect(
        page.getByRole("heading", { name: "Review complete" }),
      ).toBeVisible();
      const sqlite = new Database(filename);
      try {
        expect(
          sqlite
            .prepare("SELECT status FROM chapters WHERE id=?")
            .get(fixture.chapter),
        ).toEqual({ status: "passed" });
        expect(
          (
            sqlite
              .prepare("SELECT completed_at FROM courses WHERE id=?")
              .get(fixture.course) as { completed_at: number }
          ).completed_at,
        ).toBeTruthy();
        expect(
          sqlite
            .prepare(
              "SELECT count(*) n FROM study_review_events WHERE user_id=?",
            )
            .get(fixture.userId),
        ).toEqual({ n: 5 });
      } finally {
        sqlite.close();
      }
      await page.screenshot({
        path: `test-results/todays-study-result-${width}.png`,
        fullPage: true,
      });
      await page
        .getByRole("link", { name: "View today’s study", exact: true })
        .click();
      await expect(
        page.getByText("1 concept is due. This batch includes up to five."),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "Start review", exact: true })
        .click();
      await answer(page);
      await page
        .getByRole("link", { name: "View today’s study", exact: true })
        .click();
      await expect(page.getByText(/Nothing is due today/)).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Start review", exact: true }),
      ).toHaveCount(0);
      const response = await page.request.get(`/api/study/reviews/${id}`);
      expect(response.status()).toBe(200);
      expect(response.headers()["cache-control"]).toContain("no-store");
      await page
        .getByRole("link", { name: "Continue lesson", exact: true })
        .click();
      await expect(
        page.getByRole("heading", { name: "Conditional events", exact: true }),
      ).toBeVisible();
    } finally {
      const sqlite = new Database(filename);
      sqlite.pragma("foreign_keys = ON");
      sqlite
        .prepare("DELETE FROM courses WHERE id IN (?,?)")
        .run(fixture.course, fixture.next);
      sqlite
        .prepare("DELETE FROM study_preferences WHERE user_id=?")
        .run(fixture.userId);
      sqlite.close();
    }
  });

test("foreign sessions are private and changed sources need explicit refresh", async ({
  page,
  browser,
}) => {
  const fixture = seed();
  try {
    await page.request.put("/api/study/preferences", {
      data: { timeZone: "UTC" },
    });
    expect((await page.request.put("/api/study/preferences", {data:{timeZone:"Asia/Kolkata"},headers:{origin:"https://foreign.example"}})).status()).toBe(403);
    const review = await (
      await page.request.post("/api/study/reviews", { data: {} })
    ).json();
    const other = await browser.newContext({
      storageState: { cookies: [], origins: [] },
    });
    try {
      expect(
        (
          await other.request.get(
            `http://localhost:3102/api/study/reviews/${review.id}`,
          )
        ).status(),
      ).toBe(401);
      expect(
        (
          await other.request.post(
            "http://localhost:3102/api/auth/email-otp/send-verification-otp",
            { data: { email: "second@example.com", type: "sign-in" } },
          )
        ).ok(),
      ).toBe(true);
      const messages = readFileSync("data/login-e2e-outbox.jsonl", "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const otp = messages
        .filter((message) => message.email === "second@example.com")
        .at(-1).code;
      expect(
        (
          await other.request.post(
            "http://localhost:3102/api/auth/sign-in/email-otp",
            { data: { email: "second@example.com", otp } },
          )
        ).ok(),
      ).toBe(true);
      expect(
        (
          await other.request.get(
            `http://localhost:3102/api/study/reviews/${review.id}`,
          )
        ).status(),
      ).toBe(404);
      expect(
        (
          await other.request.post(
            `http://localhost:3102/api/study/reviews/${review.id}/submit`,
            {
              data: {
                answers: review.questions.map((q: { id: string }) => ({
                  questionId: q.id,
                  selectedOptionIndex: 0,
                })),
              },
            },
          )
        ).status(),
      ).toBe(404);
      expect(
        await (
          await other.request.get("http://localhost:3102/api/study/today")
        ).json(),
      ).toMatchObject({ dueCount: 0, setupRequired: true });
    } finally {
      await other.close();
    }
    const sqlite = new Database(filename);
    try {
      sqlite
        .prepare("UPDATE questions SET prompt='Changed source' WHERE id=?")
        .run(review.questions[0].id);
    } finally {
      sqlite.close();
    }
    await page.goto(`/study/review/${review.id}`);
    await expect(
      page.getByRole("button", { name: "Refresh review" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Refresh review" }).click();
    await expect(
      page.getByRole("heading", { name: "Review earlier ideas" }),
    ).toBeVisible();
  } finally {
    const sqlite = new Database(filename);
    sqlite.pragma("foreign_keys = ON");
    sqlite
      .prepare("DELETE FROM courses WHERE id IN (?,?)")
      .run(fixture.course, fixture.next);
    sqlite
      .prepare("DELETE FROM study_preferences WHERE user_id=?")
      .run(fixture.userId);
    sqlite.close();
  }
});

test("refreshes persisted recommendations on scheduled rollover and focus", async ({page}) => {
 const fixture = seed();
 try {
  await page.request.put("/api/study/preferences", {data:{timeZone:"UTC"}});
  const actual = await (await page.request.get("/api/study/today")).json();
  const sqlite = new Database(filename);
  try { sqlite.prepare("UPDATE concept_review_schedules SET due_date='2999-01-01' WHERE user_id=?").run(fixture.userId); } finally { sqlite.close(); }
  await page.clock.install();
  let reads = 0;
  await page.route("**/api/study/today", async route => {
   const response=await route.fetch();const body=await response.json();reads++;
   // Control only the client timer boundary; server date arithmetic is fixed-clock unit tested.
   await route.fulfill({response,json:{...body,nextRollover:new Date(Date.now()+2000).toISOString()}});
  });
  await page.goto("/");await expect(page.getByText(/Nothing is due today/)).toBeVisible();
  const update = new Database(filename);try {update.prepare("UPDATE concept_review_schedules SET due_date=? WHERE user_id=?").run(actual.today,fixture.userId);}finally{update.close();}
  await page.clock.fastForward(3000);await expect(page.getByText("6 concepts are due. This batch includes up to five.")).toBeVisible();
  const previous=reads;await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect.poll(()=>reads).toBeGreaterThan(previous);
 } finally {const sqlite=new Database(filename);sqlite.pragma("foreign_keys = ON");sqlite.prepare("DELETE FROM courses WHERE id IN (?,?)").run(fixture.course,fixture.next);sqlite.prepare("DELETE FROM study_preferences WHERE user_id=?").run(fixture.userId);sqlite.close();}
});

test("long concept and course names wrap on narrow screens", async ({page}) => {
 const fixture=seed();
 try {
  const sqlite=new Database(filename);
  try {
   sqlite.prepare("UPDATE courses SET topic=? WHERE id=?").run("Probability and conditional reasoning for unfamiliar situations ".repeat(3),fixture.course);
   sqlite.prepare("UPDATE questions SET concept_tag=concept_tag || ? WHERE chapter_id=?").run(":"+"UnbrokenConceptName".repeat(8),fixture.chapter);
  }finally{sqlite.close();}
  await page.request.put("/api/study/preferences",{data:{timeZone:"UTC"}});
  await page.setViewportSize({width:320,height:844});await page.goto("/");
  await expect(page.getByRole("button",{name:"Start review",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Start review",exact:true}).click();await expect(page.getByRole("group")).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{const sqlite=new Database(filename);sqlite.pragma("foreign_keys = ON");sqlite.prepare("DELETE FROM courses WHERE id IN (?,?)").run(fixture.course,fixture.next);sqlite.prepare("DELETE FROM study_preferences WHERE user_id=?").run(fixture.userId);sqlite.close();}
});
