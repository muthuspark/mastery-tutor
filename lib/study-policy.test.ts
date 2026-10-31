import { describe, expect, it } from "vitest";
import {
  addDays,
  localDate,
  nextRollover,
  validTimeZone,
} from "./study-calendar";
import {
  selectNextLesson,
  conceptKey,
  observeSchedule,
  orderReviews,
  reviewReason,
} from "./study-policy";
describe("calendar scheduling", () => {
  it("uses local dates and calendar addition across DST, leap and year boundaries", () => {
    expect(localDate(new Date("2026-10-31T20:00:00Z"), "Asia/Kolkata")).toBe(
      "2026-11-01",
    );
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    for (const instant of ["2026-03-08T05:00:00Z", "2026-11-01T04:00:00Z"]) {
      const now = new Date(instant),
        next = new Date(nextRollover(now, "America/New_York"));
      expect(localDate(next, "America/New_York")).toBe(
        addDays(localDate(now, "America/New_York"), 1),
      );
    }
    expect(validTimeZone("UTC")).toBe(true);
    expect(validTimeZone("invalid")).toBe(false);
  });
  it("advances 1/3/7/14/30 and caps at 30", () => {
    let date = "2026-01-01";
    let state = observeSchedule(undefined, true, date, "chapter");
    expect(state.dueDate).toBe("2026-01-02");
    for (const interval of [3, 7, 14, 30, 30]) {
      date = state.dueDate;
      state = observeSchedule(state, true, date, "review");
      expect(state.dueDate).toBe(addDays(date, interval));
    }
    expect(observeSchedule(state, false, date, "review").dueDate).toBe(
      addDays(date, 1),
    );
  });
  it("does not accelerate on same-day successes; a miss wins", () => {
    const state = observeSchedule(undefined, true, "2026-01-01", "chapter");
    expect(observeSchedule(state, true, "2026-01-01", "review")).toEqual(state);
    const miss = observeSchedule(state, false, "2026-01-01", "chapter");
    expect(observeSchedule(miss, true, "2026-01-01", "review")).toEqual(miss);
    expect(observeSchedule(state, true, "2026-01-05", "chapter").dueDate).toBe(
      state.dueDate,
    );
  });
  it("orders by due date, miss and stable identity with factual reasons", () => {
    expect(
      orderReviews([
        { id: "b", dueDate: "2026-01-01", lastOutcome: null },
        { id: "a", dueDate: "2026-01-01", lastOutcome: "incorrect" },
      ]).map((x) => x.id),
    ).toEqual(["a", "b"]);
    expect(reviewReason("2026-01-01", "2026-01-04", "incorrect")).toContain(
      "Overdue by 3 days",
    );
    expect(conceptKey("  Conditional   Probability ")).toBe(
      "conditional probability",
    );
  });
});

it("falls through courses with unmet prerequisites without unlocking", () => {
  const courses = ["a", "b"].map((id) => ({
    id,
    topic: id,
    preparationStatus: "ready",
    startedAt: null,
    createdAt: new Date(0),
  }));
  const chapters = [
    {
      id: "a",
      courseId: "a",
      idx: 1,
      title: "Locked prerequisite",
      status: "open",
      prerequisites: [0],
    },
    {
      id: "b",
      courseId: "b",
      idx: 0,
      title: "Ready",
      status: "open",
      prerequisites: [],
    },
  ];
  expect(selectNextLesson(courses, chapters)?.href).toBe("/course/b/ch/0");
  expect(chapters[0].status).toBe("open");
});
