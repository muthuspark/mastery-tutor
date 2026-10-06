type ExportCourse = {
  topic: string;
  chapters: Array<{
    idx: number;
    title: string;
    objectives: string[];
    status: string;
    content: string | null;
    summary: string | null;
  }>;
};

export function courseToMarkdown(course: ExportCourse) {
  const chapters = course.chapters
    .sort((a, b) => a.idx - b.idx)
    .map((chapter) => [
      `## Chapter ${chapter.idx + 1}: ${chapter.title}`,
      `Status: ${chapter.status}`,
      "",
      "### Objectives",
      ...chapter.objectives.map((objective) => `- ${objective}`),
      "",
      chapter.content ?? "_This chapter has not been generated yet._",
      chapter.summary ? `\n**Summary:** ${chapter.summary}` : "",
    ].join("\n"))
    .join("\n\n---\n\n");

  return `# ${course.topic}\n\n${chapters}\n`;
}
