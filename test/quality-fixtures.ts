export const samplePlan = () => ({
  topic: "Operating Systems",
  brief: { outcome: "Reason about resource sharing", assumedKnowledge: ["Programming"], likelyGaps: ["Scheduling mechanisms"], depthGuidance: "Explain mechanisms through traces" },
  chapters: [{ title: "Process isolation", objectives: ["Trace a protected memory access"], prerequisites: [] as number[], teachingPlan: { capability: "Explain isolation", introduces: ["Address spaces"], assumes: ["Memory addresses"], application: "Trace two processes reading the same address" } }],
});
