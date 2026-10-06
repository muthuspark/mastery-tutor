import { describe, expect, it } from "vitest";
import { courseIsComplete, passed, remediation } from "./gating";
import { dueChapterIndex } from "./review";

describe("mastery gating", () => {
  it("passes at the inclusive 0.8 threshold", () => {
    expect(passed(0.8)).toBe(true);
    expect(passed(0.79)).toBe(false);
  });

  it("schedules repeated misses farther out and builds remediation", () => {
    expect(dueChapterIndex(2, 0)).toBe(3);
    expect(dueChapterIndex(2, 1)).toBe(4);
    expect(remediation(["latency", "latency"])).toContain("latency");
    expect(courseIsComplete([{ status: "passed" } as never])).toBe(true);
  });
});
