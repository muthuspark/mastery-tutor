import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { runAgentObject } from "./agent";
import { generateReviewedObject } from "./quality";
import { coursePlanSchema, QualityError } from "./quality-contracts";
import { samplePlan } from "../test/quality-fixtures";

const issue = { severity: "blocking", category: "repetition", location: "chapters[0]", evidence: "Repeats prerequisites", guidance: "Teach a new capability" };
describe("bounded quality review", () => {
  it("repairs once and reviews the exact normalized draft", async () => {
    const run = vi.fn<typeof runAgentObject>();
    run.mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [issue] }).mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [] });
    const result = await generateReviewedObject("codex", "syllabus", "Context", coursePlanSchema, { run, normalize: (plan) => ({ ...plan, topic: "Normalized" }) });
    expect(result.topic).toBe("Normalized");
    expect(run.mock.calls.map((call) => call[1])).toEqual(["syllabus", "review", "syllabus", "review"]);
    expect(run.mock.calls[1][2]).toContain('"topic":"Normalized"');
    expect(run.mock.calls[2][2]).toContain("Teach a new capability");
  });
  it("fails persistent quality rejection without a third draft", async () => {
    const run = vi.fn<typeof runAgentObject>();
    run.mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [issue] }).mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({ issues: [issue] });
    await expect(generateReviewedObject("claude", "syllabus", "Context", coursePlanSchema, { run })).rejects.toBeInstanceOf(QualityError);
    expect(run).toHaveBeenCalledTimes(4);
  });
  it("uses the same repair budget for invalid structure and never accepts malformed review", async () => {
    const run = vi.fn<typeof runAgentObject>().mockResolvedValue({});
    await expect(generateReviewedObject("codex", "syllabus", "Context", coursePlanSchema, { run })).rejects.toBeInstanceOf(QualityError);
    expect(run).toHaveBeenCalledTimes(2);
    run.mockReset().mockResolvedValueOnce(samplePlan()).mockResolvedValueOnce({});
    await expect(generateReviewedObject("codex", "syllabus", "Context", coursePlanSchema, { run })).rejects.toBeInstanceOf(QualityError);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
